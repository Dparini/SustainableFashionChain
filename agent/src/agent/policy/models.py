from decimal import Decimal
from typing import Annotated, Literal
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, StrictBool, StrictInt, model_validator


def decimal_input(value):
    if isinstance(value, bool) or not isinstance(value, (str, int, float, Decimal)):
        raise ValueError("INVALID_DECIMAL")
    result = Decimal(str(value))
    if not result.is_finite():
        raise ValueError("NONFINITE_NUMBER")
    return result


Number = Annotated[Decimal, BeforeValidator(decimal_input)]
Nonnegative = Annotated[Number, Field(ge=0)]
Positive = Annotated[Number, Field(gt=0)]
Ratio = Annotated[Number, Field(ge=0, le=1)]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, allow_inf_nan=False)


class Action(Model):
    action: Literal["HOLD", "BUY_COT", "SELL_COT"]
    amount: Nonnegative
    confidence: Ratio
    reason: str = Field(min_length=1, max_length=2000, strict=True)

    @model_validator(mode="after")
    def amount_matches_action(self):
        if (self.action == "HOLD") != (self.amount == 0):
            raise ValueError("INVALID_ACTION_AMOUNT")
        if self.amount * 10**18 != (self.amount * 10**18).to_integral_value():
            raise ValueError("COT_PRECISION_EXCEEDED")
        return self


class RiskReport(Model):
    supply_risk: Ratio
    liquidity_risk: Ratio
    oracle_risk: Ratio
    overall_risk: Ratio
    confidence: Ratio
    reason: str = Field(min_length=1, max_length=2000)


class Portfolio(Model):
    cot: Nonnegative
    usd: Nonnegative


class Reserves(Model):
    verified_kg: Nonnegative
    tokenized_kg: Nonnegative
    verified: StrictBool


class Oracle(Model):
    price: Positive
    updated_at: StrictInt = Field(gt=0)
    round_id: StrictInt = Field(gt=0)
    answered_in_round: StrictInt = Field(gt=0)


class Market(Model):
    quote_price: Positive
    liquidity_usd: Nonnegative
    fee_bps: StrictInt = Field(ge=0, le=1000)


class SupplyChain(Model):
    delayed_shipments: StrictInt = Field(ge=0)
    rejected_batches: StrictInt = Field(ge=0)
    supplier_name: str = Field(max_length=4000)


class State(Model):
    timestamp: StrictInt = Field(gt=0)
    source: Literal["fixture", "local_chain", "live"]
    fabric_connected: StrictBool
    ethereum_connected: StrictBool
    portfolio: Portfolio
    reserves: Reserves
    oracle: Oracle
    market: Market
    supply_chain: SupplyChain
    bridge_replay_detected: StrictBool
    chain_id: StrictInt = Field(gt=0)
    block_number: StrictInt = Field(ge=0)


class Violation(Model):
    policy: str
    requested: str
    allowed: str


class PolicyResult(Model):
    approved: StrictBool
    violations: tuple[Violation, ...]


class Simulation(Model):
    success: StrictBool
    kind: Literal["analytical", "eth_call"]
    estimated_gas: StrictInt = Field(ge=0)
    expected_cot_delta: Number
    expected_usd_delta: Number
    post_trade_exposure: Nonnegative
    state_hash: str
    action_hash: str
    reason: str
