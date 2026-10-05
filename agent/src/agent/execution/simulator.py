from ..audit import digest
from ..policy.engine import PolicyEngine, effects
from ..policy.models import Simulation


class AnalyticalSimulator:
    """Offline arithmetic only; does not claim eth_call or fabricated gas estimates."""
    def __init__(self, engine=None):
        self.engine = engine or PolicyEngine()

    def simulate(self, action, state, risk):
        policy = self.engine.evaluate(action, state, risk)
        dc, du, pc, pu, exposure, _ = effects(action, state)
        return Simulation(success=policy.approved, kind="analytical", estimated_gas=0,
                          expected_cot_delta=dc, expected_usd_delta=du,
                          post_trade_exposure=exposure if exposure.is_finite() else 0,
                          state_hash=digest(state), action_hash=digest(action),
                          reason="Offline arithmetic; execution requires eth_call against the configured local market.")
