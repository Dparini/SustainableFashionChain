import json
import time
from decimal import Decimal as D
from pathlib import Path
from urllib.parse import urlparse
from web3 import Web3
from ..policy.models import State
from .fabric import FabricReader


def load_config(path):
    path = Path(path).resolve()
    config = json.loads(path.read_text())
    config["_directory"] = str(path.parent)
    if config.get("fabric_fixture"):
        config["fabric_fixture"] = str(path.parent / config["fabric_fixture"])
    return config


def abi(config, name):
    # ABI directory is deployment tooling input, never model-controlled.
    artifact = Path(config["_directory"]) / config["artifacts_dir"] / ("demo/" if name.startswith("Demo") else "") / f"{name}.sol" / f"{name}.json"
    return json.loads(artifact.read_text())["abi"]


class EthereumReader:
    def __init__(self, config):
        self.config = config
        host = urlparse(config["rpc_url"]).hostname
        if host not in {"localhost", "127.0.0.1", "::1", "ethereum"}:
            raise ValueError("LOCAL_RPC_REQUIRED")
        self.web3 = Web3(Web3.HTTPProvider(config["rpc_url"], request_kwargs={"timeout": 10}))
        if self.web3.eth.chain_id not in {1337, 31337}:
            raise ValueError("LOCAL_CHAIN_REQUIRED")
        self.contracts = {name: self.web3.eth.contract(address=Web3.to_checksum_address(config[name]), abi=abi(config, name))
                          for name in ["CotToken", "CottonReserveRegistry", "DemoUSD", "DemoPriceFeed", "DemoCotMarket"]}
        for name, contract in self.contracts.items():
            code = self.web3.eth.get_code(contract.address)
            if not code or Web3.keccak(code).hex() != config["code_hashes"][name]:
                raise ValueError("CONTRACT_CODE_MISMATCH")
        market = self.contracts["DemoCotMarket"]
        if (market.functions.cot().call() != self.contracts["CotToken"].address or
            market.functions.usd().call() != self.contracts["DemoUSD"].address or
            market.functions.feed().call() != self.contracts["DemoPriceFeed"].address or
            self.contracts["CotToken"].functions.reserveRegistry().call() != self.contracts["CottonReserveRegistry"].address):
            raise ValueError("CONTRACT_BINDING_MISMATCH")
        self.account = Web3.to_checksum_address(config["executor_address"])

    def aggregate(self):
        w3, c = self.web3, self.contracts
        block = w3.eth.get_block("latest")
        n = block["number"]
        call = lambda fn: fn.call(block_identifier=n)
        round_id, answer, _, updated, answered = call(c["DemoPriceFeed"].functions.latestRoundData())
        feed_decimals = call(c["DemoPriceFeed"].functions.decimals())
        price = D(answer) / D(10**feed_decimals)
        fabric, fabric_connected = FabricReader(self.config).read()
        batches = fabric["batches"]
        fabric_verified = sum((D(str(b["quantityKg"])) for b in batches if b["rwaStatus"] in {"VERIFIED", "TOKENIZED"}), D(0))
        chain_verified = D(call(c["CottonReserveRegistry"].functions.totalVerifiedKg())) / 10**18
        valid_backing = chain_verified == fabric_verified and bool(batches)
        # Compare each mirrored provenance binding as well as the global sum.
        for b in batches:
            reserve = call(c["CottonReserveRegistry"].functions.reserves(Web3.keccak(text=b["batchId"])))
            valid_backing &= (reserve[4] and D(reserve[1]) / 10**18 == D(str(b["quantityKg"])) and
                              "0x" + reserve[5].hex() == b["certificationHash"] and
                              reserve[6].hex() == b["fabricVerificationTxId"].removeprefix("0x"))
        market = c["DemoCotMarket"]
        usd_liquidity = D(call(c["DemoUSD"].functions.balanceOf(market.address))) / 10**6
        cot_liquidity = D(call(c["CotToken"].functions.balanceOf(market.address))) / 10**18 * price
        return State.model_validate({
            "timestamp": max(int(time.time()), block["timestamp"]),
            "source": "live" if fabric_connected else "local_chain",
            "fabric_connected": fabric_connected, "ethereum_connected": True,
            "portfolio": {"cot": D(call(c["CotToken"].functions.balanceOf(self.account))) / 10**18,
                          "usd": D(call(c["DemoUSD"].functions.balanceOf(self.account))) / 10**6},
            "reserves": {"verified_kg": min(chain_verified, fabric_verified),
                         "tokenized_kg": D(max(call(c["CotToken"].functions.totalSupply()), call(c["CottonReserveRegistry"].functions.totalTokenizedKg()))) / 10**18,
                         "verified": bool(valid_backing)},
            "oracle": {"price": price, "updated_at": updated, "round_id": round_id, "answered_in_round": answered},
            "market": {"quote_price": price, "liquidity_usd": min(usd_liquidity, cot_liquidity),
                       "fee_bps": call(market.functions.feeBps())},
            "supply_chain": {key: fabric[key] for key in ["delayed_shipments", "rejected_batches", "supplier_name"]},
            "bridge_replay_detected": False, "chain_id": w3.eth.chain_id, "block_number": n,
        })
