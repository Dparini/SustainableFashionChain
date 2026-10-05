from decimal import Decimal as D
from ..policy.models import Action


class AllocatorAgent:
    """Produces a proposal only. Authorization belongs to PolicyEngine."""
    def propose(self, state, risk):
        if risk.overall_risk > D("0.6"):
            return Action(action="HOLD", amount=0, confidence="0.9", reason="Risk above baseline allocation threshold.")
        nav = state.portfolio.usd + state.portfolio.cot * state.oracle.price
        target_kg = nav * D("0.27") / state.oracle.price
        if state.portfolio.cot >= target_kg:
            return Action(action="HOLD", amount=0, confidence="0.9", reason="Portfolio already meets the baseline target.")
        amount = min(D(500), max(D(0), target_kg - state.portfolio.cot)).quantize(D("0.000001"))
        return Action(action="BUY_COT", amount=amount, confidence="0.78", reason="Move toward 27% target using a capped proposal; independent policy checks still apply.")
