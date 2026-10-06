# Reliability review

This pass reviews the supported cotton, garment, bridge and bounded-agent paths.
It is an internal code review, not an independent security audit.

## Corrected findings

| Finding | Resolution | Regression evidence |
| --- | --- | --- |
| Published JWT/API/session/login credentials granted implicit access | Random ephemeral keys or explicit configuration; domain-separated tokens; no default API/admin/password access | Forged-token, published-key and login rejection tests |
| NFT acknowledgment accepted identities without the bridge role | Require `sfc.role=bridge`, pending mint state and a positive token ID; identical retries preserve later recycling state | Fabric authorization/state-machine tests |
| Generic status updates could forge garment NFT state | Finished-product updates use dedicated transitions; reserved provenance fields cannot be merged into metadata | Fabric mutation rejection tests |
| Lost NFT acknowledgment stranded an already-minted asset | Recover the unique mint receipt, original recipient, metadata and product identity before acknowledging Fabric | NFT recovery test; local E2E |
| Recycling errors were swallowed | Require a successful, confirmed Ethereum receipt and a restricted idempotent Fabric acknowledgment; retain failed queue entries | Recycling retry/authorization tests |
| Runtime required an unrelated sidechain contract | Remove the sidechain, synthetic validator, state-channel and Merkle submission paths; process each supported action independently | Queue concurrency/failure tests; Compose |
| Event-stream failures left a seemingly healthy bridge | Mark unhealthy, notify runtime and close connections; committed events are replayed on restart | Event-stream failure test |
| Ledger queries silently accepted malformed JSON and leaked iterators | Fail explicitly on corrupt records, close in `finally`, exclude tokenization requests from product results | Iterator and query regression test |
| E2E harness could connect to another process on its port | Check port availability before starting; bound RPC and child-command waits | Clean-checkout E2E and occupied-port preflight |

Missing records return 404 and repeated approval returns 409; unmapped ledger/transport
errors return a sanitized 503 rather than exposing raw Fabric internals.

## Removed code

Unused SidechainBridge, GovernanceToken and placeholder SustainableFashion contracts;
standalone mock/simple bridge scripts; the unreferenced tokenization worker that lacked
committed event identity; unused NFT metadata generation and owner-history storage;
and bridge-only Merkle/hash dependencies. Existing supported APIs and funded circular
rewards remain in scope.

## Remaining boundaries

- Attestors and bridge identities remain trusted, and certification does not prove physical existence.
- Restart recovery currently scans committed events from genesis. Large deployments need durable cursors, bounded queues and dead-letter handling.
- A permanently invalid action remains queued for operator intervention; this demo does not claim production delivery guarantees.
- The executor is restricted to local test chains. Inclusion guards constrain trades, but compromised signing/admin keys remain outside model policy protection.
- Manufacturing records provenance rather than redemption or physical cotton consumption.
- The video is an annotated rendering of recorded E2E evidence, with a Fabric fixture explicitly identified. Live Fabric is tested separately.

## Validation evidence

Verified code commit: `4035c1d0a4cb8b83090931ffd68d0c4f85c058c3` (2026-10-06).

- [All four CI jobs passed](https://github.com/Dparini/SustainableFashionChain/actions/runs/37436567364): boundary tests, dependency audits, Compose demo and live Fabric integration.
- A separate clone from the public GitHub URL contained no `.env`, wallets, host dependencies or generated artifacts. `docker compose up --build -d` built and ran the documented stack without file edits or copied configuration.
- Bootstrap and agent exited 0; Ethereum was healthy. Logs confirmed backed mint, replay rejection, garment NFT/recycling acknowledgment and successful `eth_call` simulation. The checkout remained clean afterward.
- Local verification passed 49 Solidity, 10 Fabric, 18 bridge/Gateway/compatibility, 14 API and 35 agent tests, plus 50 recorded adversarial evaluations. Frontend validation also passed in CI.
- An occupied-port test failed before starting or using any Ethereum process, leaving the pre-existing listener untouched.
- Both videos are 1280×720, exactly 80 seconds; the lifecycle video was fully decoded without errors and representative frames inspected.

The default Compose recording still uses the explicitly labelled Fabric fixture.
The separate live-Fabric CI job verifies actual consensus and committed events.
