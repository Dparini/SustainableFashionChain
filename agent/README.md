# Bounded autonomous RWA agents

Agent = proposes. Policy Engine = authorizes. Simulator = verifies effects.
Executor = executes.

RiskAgent and AllocatorAgent have no signer, provider, tools or arbitrary calldata.
The default baseline is deterministic and free. An optional local Ollama model
can replace proposal generation; policy and execution boundaries stay independent.

## Install and run

From the repository root, with Python 3.11+ and uv:

```sh
uv sync --project agent --extra test --frozen
agent/.venv/bin/sfc status
agent/.venv/bin/sfc demo
agent/.venv/bin/python -m agent run --mode simulation
agent/.venv/bin/sfc benchmark
```

`sfc agent run` is an alias for `sfc run`. The offline demo does not connect to
Fabric or Ethereum. It reports `analytical` simulation and no gas estimate.
The installable wheel includes eval scenarios and the policy YAML.

## Actions and policies

Only HOLD, BUY_COT and SELL_COT are accepted. Amount is denominated in kg/COT,
confidence is in [0,1], and reason is bounded text. HOLD requires amount zero;
trades require positive quantities with at most 18 decimals. Unknown fields,
recipients, calldata, booleans posing as numbers and nonfinite values are rejected.
Decimals are serialized as normalized strings for reproducible precision.

Defaults in `src/agent/policy/policies.yaml`: 35% maximum exposure, 10% trade size,
50bps slippage, USD 10,000 minimum liquidity, 3600s oracle age, 100% backing,
65% confidence and 80% maximum supply-risk score. Current balances and expected
post-trade balances are checked. Supply-risk limits are also computed from raw
shipment data, so an optimistic model report cannot bypass them.

## Local Ethereum simulation and execution

```sh
docker compose up --build -d
docker compose logs agent
docker compose run --rm agent status --config /demo/local.json
docker compose run --rm agent run --config /demo/local.json
```

This demo runs real contracts and real chaincode functions against an in-memory
Fabric fixture. `source=local_chain` and `Fabric: fixture` remain visible. The
state aggregator pins all Ethereum reads to one block and compares batch quantity,
certification hash and verification transaction against the reserve registry.
The fixed-price local market is an exercise venue, not a DeFi AMM. demoUSD is
test collateral with no economic value.

Execution is explicit and limited to chain IDs 1337/31337:

```sh
docker compose run --rm agent run --mode execute --config /demo/local.json --audit /demo/decisions.jsonl
```

The bootstrap explicitly configures an unlocked local test signer and bounded
allowances (USD 1,000 and 1,000 COT). There are no model signing keys. A private
signer can instead be provided via `SFC_EXECUTOR_KEY`, read only inside Executor.
Only the configured fixed market's buy/sell methods can be built. No automatic
unlimited approvals are performed. Real chains and remote RPC endpoints are rejected.

`eth_call` simulates the exact transaction, gas is estimated, and the market quote
must match expected deltas. Executor then fetches fresh state, rechecks policy,
reruns simulation, records the final transaction and only then signs. Onchain
freshness, deadline, slippage, exposure and size guards also apply at inclusion.
Configuration and code hashes are trusted deployment inputs; an administrator
who changes them is inside the trust boundary.

## Optional local LLM

Start your own Ollama server with an installed model, then:

```sh
agent/.venv/bin/sfc run --model <installed-model-name>
agent/.venv/bin/sfc benchmark --model <installed-model-name> --repetitions 1
```

The adapter uses [Ollama JSON schema structured outputs](https://docs.ollama.com/capabilities/structured-outputs)
and validates every result again with Pydantic. It exposes no tools and sends
only typed state/risk data. Temperature zero improves repeatability but does not
constitute a safety control. Adapter tests deliberately return malicious JSON;
an installed-model benchmark requires a real local server. No model-quality
results are fabricated when that server is absent.

## Evaluations and audit

Ten scenario files cover normal market, stale oracle, supply shock, low liquidity,
invalid reserves, bridge replay, extreme price, arbitrary-action hallucination,
oversized trade and missing data. Five repetitions produce 50 measured decisions.
Recorded proposals are an adversarial fixture corpus, not a named-model benchmark.
Validity measures schema-valid action outputs. Safety independently checks the
approved outcome's invariants. Correctness checks labelled approval/rejection.
Local model API fees are zero; compute and electricity cost are not estimated.
100% safety on this finite suite is not a universal safety proof.

JSONL records contain the typed snapshot, canonical Keccak-256 state hash, model
identity, risk, proposal, policy, simulation and transaction. Revalidated execution
snapshots, transaction fields, broadcast/confirmed status and post-state hashes
are separately preserved. A state hash binds the observation; it does not prove
physical truth or prevent other transactions from changing future state.

```sh
agent/.venv/bin/python -m pytest agent/tests -q
node scripts/local-e2e.cjs
```

The policy engine and signer do not protect against host compromise or theft of
an executor/attestor key. See [THREAT_MODEL.md](../THREAT_MODEL.md).
