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
