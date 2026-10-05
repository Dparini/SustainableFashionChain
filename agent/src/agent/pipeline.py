from pydantic import ValidationError
from .agents.risk import RiskAgent
from .agents.allocator import AllocatorAgent
from .policy.engine import PolicyEngine
from .policy.models import Action, State
from .execution.simulator import AnalyticalSimulator
from .audit import record


def decide(raw_state, raw_proposal=None, *, engine=None, simulator=None, model="deterministic-baseline", proposer=None):
    engine = engine or PolicyEngine()
    simulator = simulator or AnalyticalSimulator(engine)
    state = risk = action = policy = simulation = None
    stage = "INVALID_STATE"
    try:
        state = State.model_validate(raw_state.model_dump() if isinstance(raw_state, State) else raw_state)
        stage = "INVALID_AGENT_OUTPUT"
        risk = proposer.assess(state) if proposer else RiskAgent().assess(state)
        action = (proposer.propose(state, risk) if proposer else AllocatorAgent().propose(state, risk)) if raw_proposal is None else Action.model_validate(raw_proposal)
        policy = engine.evaluate(action, state, risk)
        if policy.approved:
            stage = "SIMULATION_FAILED"
            simulation = simulator.simulate(action, state, risk)
        return record(state, risk, action, policy, simulation, model=model)
    except (ValidationError, ValueError, ArithmeticError) as exc:
        code = stage
        return record(raw_state, risk, action, policy, simulation,
                      error={"code": code, "details": "Schema validation failed; no transaction was built."}, model=model)
    except Exception as exc:
        return record(raw_state, risk, action, policy, simulation,
                      error={"code": stage, "details": type(exc).__name__}, model=model)
