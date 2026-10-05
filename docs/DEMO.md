# Reproduce the demonstration

The committed video is 80 seconds long. It is rendered from real test output,
with an explicitly labelled in-memory Fabric chaincode fixture and a real local
Ethereum chain. It contains no model benchmark or production trading claim.

## Capture and render

Install Node 22+, Docker, Python 3.11+, uv and ffmpeg. Install JavaScript
packages with `npm ci` in ethereum, bridging, fabric/application and
fabric/chaincode/supplychain, then run from the repository root:

```sh
uv sync --project agent --extra test --extra demo --frozen
SFC_DEMO_CAPTURE_DIR=docs/assets node scripts/local-e2e.cjs
agent/.venv/bin/python scripts/render-demo.py
```

The harness starts its own local Ethereum process, deploys contracts, executes
actual chaincode functions, tests relay replay/reconciliation, runs exact
`eth_call`, rejects an unsafe proposal, executes a guarded local trade, verifies
balances and rejects stale oracle data. It stops its own process afterward.

The capture produces `recording.json` and `e2e-summary.json`. The renderer creates
`demo.mp4`, `terminal-demo.gif` and `demo-poster.png`. Video timing is 12 seconds
architecture, 14 verification, 14 bridge, 12 proposal, 10 policy/simulation,
8 local execution and 10 dangerous-trade rejection. No gas or receipt is invented.

## Full live integration

```sh
node scripts/fabric-live-e2e.cjs
```

This separately starts a real two-organization Fabric network with CA identities,
using pinned tools in `.runtime/`. It verifies and approves the batch through
committed Gateway transactions, consumes the emitted event, attests backing
separately, mints on a local Ethereum chain and exercises agent execution.
The summary is `docs/assets/live-e2e-summary.json`. This is a development network,
not a production deployment. Existing Fabric containers cause a preflight refusal;
cleanup targets only the runner's own project and chaincode containers.

## Interactive demo

```sh
docker compose up --build -d
docker compose logs bootstrap agent
docker compose run --rm agent status --config /demo/local.json
docker compose run --rm agent demo
docker compose run --rm agent run --config /demo/local.json
```

Simulation sends no trade. Bootstrap transactions create only local test assets.
To demonstrate the isolated executor, use the explicitly configured local test
signer supplied by bootstrap:

```sh
docker compose run --rm agent run --mode execute --config /demo/local.json --audit /demo/decisions.jsonl
```

After a trade the baseline allocator may HOLD because the target exposure is
already reached. `docker compose down --volumes` resets this demo's state.
