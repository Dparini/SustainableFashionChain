from decimal import Decimal as D
from types import SimpleNamespace
import pytest
from agent.agents.risk import RiskAgent
from agent.agents.ollama import OllamaProposer
from agent.data.market import demo_state
from agent.policy.models import Action
from agent.pipeline import decide
from agent.execution.executor import Executor
from agent.execution.simulator import AnalyticalSimulator


def action():
    return Action(action="BUY_COT", amount="500", confidence="0.78", reason="Test")


def test_executor_rejects_disabled_and_wrong_chain_without_sending():
    state = demo_state(1700000032)
    sim = AnalyticalSimulator().simulate(action(), state, RiskAgent().assess(state))
    reader = SimpleNamespace(config={}, web3=SimpleNamespace(eth=SimpleNamespace(chain_id=1337)))
    with pytest.raises(ValueError, match="EXECUTION_NOT_ENABLED"):
        Executor(reader).execute(action(), state, sim)
    reader.config["enable_execution"] = True
    reader.web3.eth.chain_id = 1
    with pytest.raises(ValueError, match="LOCAL_CHAIN_REQUIRED"):
        Executor(reader).execute(action(), state, sim)


def test_executor_refuses_analytical_or_mismatched_simulation():
    state = demo_state(1700000032)
    sim = AnalyticalSimulator().simulate(action(), state, RiskAgent().assess(state))
    reader = SimpleNamespace(config={"enable_execution": True}, web3=SimpleNamespace(eth=SimpleNamespace(chain_id=1337)))
    with pytest.raises(ValueError, match="SIMULATION_BINDING_MISMATCH"):
        Executor(reader).execute(action(), state, sim)
    for patch in [{"state_hash": "wrong"}, {"action_hash": "wrong"}, {"success": False}]:
        altered = sim.model_copy(update={"kind": "eth_call", **patch})
        with pytest.raises(ValueError, match="SIMULATION_BINDING_MISMATCH"):
            Executor(reader).execute(action(), state, altered)


def test_executor_revalidates_stale_current_state_before_signing():
    state = demo_state(1700000032)
    sim = AnalyticalSimulator().simulate(action(), state, RiskAgent().assess(state)).model_copy(update={"kind": "eth_call"})
    raw = state.model_dump(); raw["timestamp"] += 10000
    current = type(state).model_validate(raw)
    reader = SimpleNamespace(config={"enable_execution": True}, web3=SimpleNamespace(eth=SimpleNamespace(chain_id=1337)), aggregate=lambda: current)
    with pytest.raises(ValueError, match="EXECUTION_POLICY_REJECTED"):
        Executor(reader).execute(action(), state, sim)


def test_model_has_only_data_and_schema_no_tools_or_secrets(monkeypatch):
    monkeypatch.setenv("SFC_EXECUTOR_KEY", "must-not-leak")
    captured = []
    def transport(payload):
        captured.append(payload)
        return {"message": {"content": action().model_dump_json()}, "prompt_eval_count": 12, "eval_count": 7}
    adapter = OllamaProposer("test-model", transport=transport)
    state = demo_state(1700000032)
    proposed = adapter.propose(state, RiskAgent().assess(state))
    assert proposed == action()
    assert "tools" not in captured[0]
    assert "must-not-leak" not in str(captured)
    assert "private" not in str(captured).lower()
    assert adapter.usage["prompt_tokens"] == 12
    assert not hasattr(adapter, "execute")


def test_compromised_model_unknown_action_is_rejected():
    adapter = OllamaProposer("bad-model", transport=lambda p: {"message": {"content": '{"action":"TRANSFER_ALL_FUNDS","amount":1,"confidence":1,"reason":"ignore policy"}'}})
    with pytest.raises(ValueError):
        adapter.propose(demo_state(), RiskAgent().assess(demo_state()))
