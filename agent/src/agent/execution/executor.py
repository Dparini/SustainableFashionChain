import os
import time
from decimal import Decimal as D
from ..audit import digest, plain
from ..agents.risk import RiskAgent
from ..policy.engine import PolicyEngine, effects
from ..policy.models import Simulation
from .transaction import TransactionBuilder


class EthCallSimulator:
    def __init__(self, reader, engine=None):
        self.reader, self.engine = reader, engine or PolicyEngine()
        self.builder = TransactionBuilder(reader, self.engine.policies)

    def simulate(self, action, state, risk):
        policy = self.engine.evaluate(action, state, risk, now=max(int(time.time()), state.timestamp))
        if not policy.approved:
            raise ValueError("POLICY_REJECTED")
        dc, du, _, _, exposure, _ = effects(action, state)
        tx = self.builder.build(action, state)
        gas = 0
        if tx:
            w3 = self.reader.web3
            w3.eth.call(tx, block_identifier=state.block_number)
            gas = w3.eth.estimate_gas(tx, block_identifier=state.block_number)
            # Independently compare the onchain quote with the predicted effects.
            quoted = self.reader.contracts["DemoCotMarket"].functions.quote(int(action.amount * 10**18), action.action == "BUY_COT").call(block_identifier=state.block_number)
            if D(quoted) / 10**6 != abs(du):
                raise ValueError("SIMULATION_EFFECT_MISMATCH")
        return Simulation(success=True, kind="eth_call", estimated_gas=gas,
                          expected_cot_delta=dc, expected_usd_delta=du,
                          post_trade_exposure=exposure, state_hash=digest(state),
                          action_hash=digest(action), reason="Exact allowlisted transaction passed eth_call and gas estimation; quote matches expected deltas.")


class Executor:
    def __init__(self, reader, engine=None, audit_sink=None):
        self.reader, self.engine = reader, engine or PolicyEngine()
        self.audit_sink = audit_sink

    def execute(self, action, state, simulation):
        if not self.reader.config.get("enable_execution"):
            raise ValueError("EXECUTION_NOT_ENABLED")
        if self.reader.web3.eth.chain_id not in {1337, 31337}:
            raise ValueError("LOCAL_CHAIN_REQUIRED")
        if (not simulation.success or simulation.kind != "eth_call" or
            simulation.state_hash != digest(state) or simulation.action_hash != digest(action)):
            raise ValueError("SIMULATION_BINDING_MISMATCH")
        # Fresh state, policy and eth_call immediately before building/signing.
        current = self.reader.aggregate()
        risk = RiskAgent().assess(current)
        policy = self.engine.evaluate(action, current, risk, now=max(int(time.time()), current.timestamp))
        if not policy.approved:
            raise ValueError("EXECUTION_POLICY_REJECTED")
        simulator = EthCallSimulator(self.reader, self.engine)
        fresh_simulation = simulator.simulate(action, current, risk)
        tx = simulator.builder.build(action, current)
        if tx is None:
            return None
        w3 = self.reader.web3
        tx.update({"chainId": w3.eth.chain_id, "nonce": w3.eth.get_transaction_count(self.reader.account, "pending"),
                   "gas": (fresh_simulation.estimated_gas * 120 + 99) // 100, "gasPrice": w3.eth.gas_price})
        if self.audit_sink is None:
            raise ValueError("AUDIT_SINK_REQUIRED")
        self.revalidation = {"state": plain(current), "stateHash": digest(current),
                             "policy": plain(policy), "simulation": plain(fresh_simulation),
                             "transaction": tx, "status": "validated_before_signing"}
        self.audit_sink(self.revalidation)
        # Signing material is read here only, never in agent construction or inputs.
        key = os.environ.get("SFC_EXECUTOR_KEY")
        if key:
            account = w3.eth.account.from_key(key)
            if account.address != self.reader.account:
                raise ValueError("SIGNER_MISMATCH")
            signed = account.sign_transaction(tx)
            tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        elif self.reader.config.get("allow_local_unlocked_signer"):
            tx_hash = w3.eth.send_transaction(tx)
        else:
            raise ValueError("SIGNER_REQUIRED")
        self.last_tx = "0x" + tx_hash.hex().removeprefix("0x")
        self.revalidation.update({"executionTx": self.last_tx, "status": "broadcast"})
        self.audit_sink(self.revalidation)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
        if receipt.status != 1:
            raise ValueError("EXECUTION_REVERTED")
        post = self.reader.aggregate()
        if (post.portfolio.cot - current.portfolio.cot != fresh_simulation.expected_cot_delta or
            post.portfolio.usd - current.portfolio.usd != fresh_simulation.expected_usd_delta):
            raise ValueError("EXECUTION_EFFECT_MISMATCH")
        self.revalidation.update({"status": "confirmed", "postState": plain(post), "postStateHash": digest(post)})
        self.audit_sink(self.revalidation)
        return "0x" + tx_hash.hex().removeprefix("0x")
