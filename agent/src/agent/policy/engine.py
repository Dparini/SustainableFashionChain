from decimal import Decimal as D, getcontext

# Enough precision for 256-bit onchain integers and 18-decimal token calculations.
getcontext().prec = 100
from pathlib import Path
from pydantic import Field, StrictBool, StrictInt
import yaml
from .models import Action, Model, Positive, Ratio, RiskReport, State, Violation, PolicyResult


class PortfolioPolicy(Model):
    max_cot_exposure: Ratio
    max_single_trade: Ratio


class MarketPolicy(Model):
    max_slippage_bps: StrictInt = Field(ge=0, le=10000)
    min_liquidity_usd: Positive
    max_oracle_deviation: Ratio


class OraclePolicy(Model):
    max_age_seconds: StrictInt = Field(ge=0, le=3600)


class RWAPolicy(Model):
    require_verified_backing: StrictBool
    min_reserve_ratio: Positive = Field(ge=1)


class AgentPolicy(Model):
    min_confidence: Ratio
    max_supply_risk: Ratio


class Policies(Model):
    portfolio: PortfolioPolicy
    market: MarketPolicy
    oracle: OraclePolicy
    rwa: RWAPolicy
    agent: AgentPolicy


def load_policies(path=None):
    return Policies.model_validate(yaml.safe_load(Path(path or Path(__file__).with_name("policies.yaml")).read_text()))


def effects(action: Action, state: State):
    delta_cot = action.amount if action.action == "BUY_COT" else -action.amount if action.action == "SELL_COT" else D(0)
    fee = state.market.fee_bps / D(10000)
    delta_usd = -delta_cot * state.market.quote_price
    delta_usd -= abs(delta_cot) * state.market.quote_price * fee
    # Local USD collateral uses six decimals; round against the trader.
    from decimal import ROUND_FLOOR
    delta_usd = delta_usd.quantize(D("0.000001"), rounding=ROUND_FLOOR)
    post_cot = state.portfolio.cot + delta_cot
    post_usd = state.portfolio.usd + delta_usd
    nav = state.portfolio.usd + state.portfolio.cot * state.oracle.price
    post_nav = post_usd + post_cot * state.oracle.price
    exposure = post_cot * state.oracle.price / post_nav if post_nav > 0 else D("Infinity")
    trade_fraction = abs(delta_usd) / nav if nav > 0 else D("Infinity")
    return delta_cot, delta_usd, post_cot, post_usd, exposure, trade_fraction


class PolicyEngine:
    def __init__(self, policies=None):
        self.policies = policies or load_policies()

    def evaluate(self, action: Action, state: State, risk: RiskReport, *, now=None):
        # Revalidate model instances too: model_construct is not a validation boundary.
        action = Action.model_validate(action.model_dump())
        state = State.model_validate(state.model_dump())
        risk = RiskReport.model_validate(risk.model_dump())
        p = self.policies
        violations = []
        def check(ok, policy, requested, allowed):
            if not ok:
                violations.append(Violation(policy=policy, requested=str(requested), allowed=str(allowed)))
        timestamp = state.timestamp if now is None else now
        age = timestamp - state.oracle.updated_at
        check(0 <= age <= p.oracle.max_age_seconds, "ORACLE_FRESHNESS", age, p.oracle.max_age_seconds)
        check(state.oracle.answered_in_round >= state.oracle.round_id, "ORACLE_COMPLETE_ROUND", state.oracle.answered_in_round, state.oracle.round_id)
        check(state.source in {"fixture", "local_chain"} or (state.fabric_connected and state.ethereum_connected), "CONNECTED_SOURCES", state.source, "connected live sources")
        check(not state.bridge_replay_detected, "BRIDGE_REPLAY", state.bridge_replay_detected, False)
        check(state.reserves.verified, "VERIFIED_BACKING", state.reserves.verified, True)
        reserve_ratio = state.reserves.verified_kg / state.reserves.tokenized_kg if state.reserves.tokenized_kg else D("Infinity")
        check(reserve_ratio >= p.rwa.min_reserve_ratio, "RESERVE_RATIO", reserve_ratio, p.rwa.min_reserve_ratio)
        if action.action != "HOLD":
            check(action.confidence >= p.agent.min_confidence, "MIN_CONFIDENCE", action.confidence, p.agent.min_confidence)
            supply_risk = max(risk.supply_risk, min(D(1), D(state.supply_chain.delayed_shipments) / 10 + D(state.supply_chain.rejected_batches) / 5))
            check(supply_risk <= p.agent.max_supply_risk, "SUPPLY_RISK", supply_risk, p.agent.max_supply_risk)
            check(state.market.liquidity_usd >= p.market.min_liquidity_usd, "MIN_LIQUIDITY", state.market.liquidity_usd, p.market.min_liquidity_usd)
            deviation = abs(state.market.quote_price / state.oracle.price - 1)
            check(deviation <= p.market.max_oracle_deviation, "ORACLE_PRICE_DEVIATION", deviation, p.market.max_oracle_deviation)
            dc, du, pc, pu, exposure, fraction = effects(action, state)
            check(pc >= 0 and pu >= 0, "SUFFICIENT_BALANCE", min(pc, pu), 0)
            check(exposure <= p.portfolio.max_cot_exposure, "MAX_COT_EXPOSURE", exposure, p.portfolio.max_cot_exposure)
            check(fraction <= p.portfolio.max_single_trade, "MAX_SINGLE_TRADE", fraction, p.portfolio.max_single_trade)
            slippage = abs(abs(du) / (action.amount * state.oracle.price) - 1) * 10000
            check(slippage <= p.market.max_slippage_bps, "MAX_SLIPPAGE", slippage, p.market.max_slippage_bps)
        return PolicyResult(approved=not violations, violations=tuple(violations))
