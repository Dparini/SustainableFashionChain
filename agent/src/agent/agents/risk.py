from decimal import Decimal as D
from ..policy.models import RiskReport, State


class RiskAgent:
    """Read-only deterministic baseline. No provider, signer or transaction tools."""
    def assess(self, state: State):
        supply = min(D(1), D(state.supply_chain.delayed_shipments) / 10 + D(state.supply_chain.rejected_batches) / 5)
        liquidity = max(D(0), min(D(1), 1 - state.market.liquidity_usd / D(50000)))
        age = state.timestamp - state.oracle.updated_at
        oracle = min(D(1), D(max(0, age)) / 3600) if age >= 0 else D(1)
        return RiskReport(supply_risk=supply, liquidity_risk=liquidity, oracle_risk=oracle,
                          overall_risk=supply * D("0.5") + liquidity * D("0.3") + oracle * D("0.2"),
                          confidence=D("0.9"), reason="Baseline scores use shipment counts, liquidity and oracle age; supplier text is not an instruction.")
