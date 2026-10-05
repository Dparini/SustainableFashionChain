import argparse
import json
import sys
from pathlib import Path
from .audit import append_record, plain, record
from .data.market import demo_state, load_state
from .agents.risk import RiskAgent
from .agents.allocator import AllocatorAgent
from .policy.models import Action
from .policy.engine import PolicyEngine
from .pipeline import decide
from .benchmark import benchmark


def render(entry):
    print("SustainableFashionChain — autonomous RWA decisions")
    print("Agent = proposes | Policy = authorizes | Simulator = verifies | Executor = executes")
    state = entry["state"]
    print(f"Source: {state.get('source', 'invalid')} | No real-money trading")
    if entry["error"]:
        print("ACTION REJECTED — " + entry["error"]["code"])
        return
    risk = entry["riskReport"]
    print(f"\nRiskAgent: supply {float(risk['supply_risk']):.2f} | liquidity {float(risk['liquidity_risk']):.2f} | overall {float(risk['overall_risk']):.2f}")
    action = entry["proposal"]
    print(f"Allocator: {action['action']} {action['amount']} COT | confidence {float(action['confidence']):.0%}")
    print("\nPolicy Engine")
    for violation in entry["policyResult"]["violations"]:
        print(f"  ✗ {violation['policy']} — requested {violation['requested']}; allowed {violation['allowed']}")
    if entry["policyResult"]["approved"]:
        print("  ✓ freshness, backing, exposure, liquidity, size and confidence")
    sim = entry["simulation"]
    if sim:
        print(f"\nSimulation: {sim['kind']} | {'PASS' if sim['success'] else 'REJECT'}")
        print(f"  COT delta {sim['expected_cot_delta']} | USD delta {sim['expected_usd_delta']} | exposure {float(sim['post_trade_exposure']):.2%}")
        print("  gas: " + (str(sim["estimated_gas"]) if sim["kind"] == "eth_call" else "not estimated (offline arithmetic)"))
    approved = entry["policyResult"]["approved"] and sim and sim["success"]
    print("\nACTION " + ("APPROVED" if approved else "REJECTED"))
    if entry["executionTx"]:
        print("Execution: " + entry["executionTx"])
    print("stateHash: " + entry["stateHash"])


def main(argv=None):
    parser = argparse.ArgumentParser(prog="sfc", description="Verifiable RWA agents. Simulation is the default.")
    sub = parser.add_subparsers(dest="command", required=True)
    status = sub.add_parser("status")
    status.add_argument("--config")
    run = sub.add_parser("run")
    agent = sub.add_parser("agent")
    agent_sub = agent.add_subparsers(dest="agent_command", required=True)
    agent_run = agent_sub.add_parser("run")
    for command in [run, agent_run]:
        command.add_argument("--mode", choices=["simulation", "execute"], default="simulation")
        command.add_argument("--config")
        command.add_argument("--model", help="Optional local Ollama model; baseline is default")
        command.add_argument("--ollama-url", default="http://127.0.0.1:11434")
        command.add_argument("--state")
        command.add_argument("--proposal")
        command.add_argument("--json", action="store_true")
        command.add_argument("--audit", default=".runtime/decisions.jsonl")
    demo = sub.add_parser("demo")
    demo.add_argument("--json", action="store_true")
    bench = sub.add_parser("benchmark")
    bench.add_argument("--scenarios", default=str(Path(__file__).with_name("eval_scenarios") if Path(__file__).with_name("eval_scenarios").exists() else Path(__file__).resolve().parents[2] / "evals/scenarios"))
    bench.add_argument("--repetitions", type=int, default=5)
    bench.add_argument("--json", action="store_true")
    bench.add_argument("--model", help="Evaluate an installed local Ollama model instead of recorded proposals")
    bench.add_argument("--ollama-url", default="http://127.0.0.1:11434")
    args = parser.parse_args(argv)
    if args.command == "benchmark":
        proposer = None
        if args.model:
            from .agents.ollama import OllamaProposer
            proposer = OllamaProposer(args.model, args.ollama_url)
        result = benchmark(args.scenarios, args.repetitions, proposer=proposer)
        if args.json:
            print(json.dumps(result))
        else:
            print(f"Running {result['scenarios']} recorded scenarios...")
            print("Source                     Valid    Safe    Correct    Cost")
            print(f"{result['model'][:24]:24}   {result['valid']:.0%}      {result['safe']:.0%}    {result['correct']:.0%}       $0 API fees (local)")
            print(result["scope"])
        return 0 if result["correct"] == 1 and result["safe"] == 1 else 1
    if args.command == "demo":
        state = demo_state()
        entries = [decide(state), decide(state, {"action": "BUY_COT", "amount": "9000", "confidence": "0.99", "reason": "Deliberately unsafe proposal for rejection demo."})]
        for entry in entries:
            if args.json: print(json.dumps(entry))
            else: render(entry); print()
        return 0
    reader = None
    if args.config:
        from .data.ethereum import EthereumReader, load_config
        reader = EthereumReader(load_config(args.config))
        state = reader.aggregate()
    else:
        state = load_state(args.state) if getattr(args, "state", None) else demo_state()
    if args.command == "status":
        print("SustainableFashionChain")
        print("Fabric: " + ("connected" if state.fabric_connected else "fixture (no live network)"))
        print("Ethereum: " + ("connected — local chain" if state.ethereum_connected else "fixture (no RPC)"))
        print(f"Oracle: {state.timestamp - state.oracle.updated_at}s old")
        print(f"Verified cotton: {state.reserves.verified_kg:,} kg")
        print(f"Tokenized capacity: {state.reserves.tokenized_kg:,} COT")
        if state.reserves.tokenized_kg:
            print(f"Reserve ratio: {state.reserves.verified_kg / state.reserves.tokenized_kg:.0%}")
        print(f"Agent risk: {RiskAgent().assess(state).overall_risk:.2f}")
        return 0
    if args.mode == "execute" and not reader:
        parser.error("execute requires --config with an explicit local signer; fixture state cannot execute")
    proposal = json.loads(Path(args.proposal).read_text()) if args.proposal else None
    simulator = None
    if reader:
        from .execution.executor import EthCallSimulator
        simulator = EthCallSimulator(reader)
    proposer = None
    if args.model:
        from .agents.ollama import OllamaProposer
        proposer = OllamaProposer(args.model, args.ollama_url)
    entry = decide(state, proposal, simulator=simulator, proposer=proposer,
                   model=args.model or "deterministic-baseline")
    if proposer:
        entry["modelUsage"] = proposer.usage
    if args.mode == "execute" and not entry["error"] and entry["simulation"]:
        from .execution.executor import Executor
        from .policy.models import Simulation
        executor = Executor(reader, audit_sink=lambda detail: append_record(args.audit, {**entry, "executionRevalidation": detail}))
        # Persist an authorization record before any send operation.
        append_record(args.audit, {**entry, "executionStatus": "authorized_pending_revalidation"})
        try:
            action = Action.model_validate(entry["proposal"])
            tx = executor.execute(action, state, Simulation.model_validate(entry["simulation"]))
            entry["executionTx"] = tx
            entry["executionRevalidation"] = getattr(executor, "revalidation", None)
        except Exception as exc:
            entry["executionTx"] = getattr(executor, "last_tx", None)
            entry["error"] = {"code": "EXECUTION_REJECTED", "details": type(exc).__name__}
    append_record(args.audit, entry)
    if args.json: print(json.dumps(entry))
    else: render(entry)
    return 0 if not entry["error"] and entry["policyResult"]["approved"] and entry["simulation"] and entry["simulation"]["success"] else 2


if __name__ == "__main__":
    sys.exit(main())
