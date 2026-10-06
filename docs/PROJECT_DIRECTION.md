# Project direction and completion record

Accepted on 2026-10-05. This file is persistent project memory. Continue from the
completion record when resuming work; do not restart or replace the objective.

**SustainableFashionChain — Verifiable RWA infrastructure from physical supply
chains to autonomous onchain markets.**

Retain Hyperledger Fabric, Ethereum, the bridge, CotToken and ProductNFT.
Sustainability is the use case; verified RWA backing, interoperability and
bounded autonomous execution are the engineering thesis. Depth over feature count.

## Non-negotiable boundaries

- 1 COT is a claim representing 1 kg of verified cotton, with 18 decimal places.
- Every mint must consume attested batch capacity. No administrative or reward
  mint path may bypass backing. Physical truth remains an attestor assumption.
- Fabric event identity is stable across retries; Ethereum rejects replay.
- Models receive read-only data and return validated HOLD/BUY_COT/SELL_COT intents.
  They never receive keys, transaction calldata, arbitrary destinations or signing tools.
- Agent proposes; policy engine authorizes; simulator verifies effects; executor executes.
- Policy checks are deterministic and fail closed on missing, stale or invalid data.
- Simulation is the default. Execution requires explicit signer configuration and
  a local demo chain. No real-money trading or implied mainnet readiness.
- Audit records contain canonical Keccak state hashes, risk, proposal, policy,
  simulation and execution results. Benchmarks report measured results only.
- Do not add new tokens, governance, a new blockchain, broad DeFi integrations,
  a large dashboard or speculative ZK features. Exactly two agents suffice.
- Git commits use the user's configured identity with no assistant co-author trailers.
  Preserve unrelated local changes, including the fabric-samples binary archive.

## Ordered implementation checklist

1. [x] README thesis, prepared GitHub metadata, cleanup and reproducible quick start.
   GitHub description/topics application is explicitly assigned to the user.
2. [x] ARCHITECTURE.md: problem, goals, overview, Fabric, Ethereum, bridge, oracle,
   agents, policy, threat model, assumptions and trade-offs.
3. [x] THREAT_MODEL.md: compromised LLM, injection, hallucination, stale/manipulated
   oracle, replay, double mint, desynchronization, executor/key compromise,
   liquidity manipulation and backing mismatch; mitigations and residual risks.
4. [x] CottonReserveRegistry.sol with batch, verified/tokenized amounts, timestamps and active flag.
5. [x] Backing invariant over every issuance route and conservative reserve lifecycle.
6. [x] Stable bridge event identifiers, onchain replay rejection and recovery tests.
7. [x] Oracle freshness <= 3600 seconds, valid price/round checks and missing-data rejection.
8. [x] Python agent package, installable sfc CLI and simulation default.
9. [x] Structured Fabric/Ethereum/oracle/market state aggregation with provenance.
10. [x] Read-only RiskAgent.
11. [x] AllocatorAgent producing proposals only.
12. [x] Strict Pydantic schemas, finite values, unknown-action rejection.
13. [x] Deterministic YAML policies: exposure 35%, single trade 10%, slippage 50 bps,
    liquidity USD 10,000, oracle age 3600s, backing >= 100%, confidence >= 65%.
14. [x] Transaction construction and simulation; check revert, deltas, gas,
    slippage, post-trade exposure and reserve invariant.
15. [x] Isolated executor with revalidation and explicit configuration.
16. [x] Audit JSONL with canonical state hash and timestamps.
17. [x] Ten eval scenarios: normal, stale oracle, supply shock, low liquidity,
    invalid reserves, replay, extreme price, hallucination, oversized trade, missing data.
18. [x] Adversarial injection tests and safety invariant tests.
19. [x] Benchmark CLI measuring valid/safe/correct outputs and actual model cost.
20. [x] GitHub Actions for contract, Fabric, bridge, agent, policy, invariant and E2E checks.
21. [x] Architecture graphic matching implemented boundaries.
22. [x] Reproducible terminal GIF showing approved and rejected decisions.
23. [x] <=90 second demo: architecture, verified batch, mint, proposal, simulation,
    deliberately dangerous trade rejected.
24. [x] Final README polish, truthful badges and clean-clone verification.

## Completion definition

A new checkout can run a clearly labelled simulation demo without credentials,
and a local-chain integration demo proves backing, replay protection and guarded
execution. Critical boundary tests and evals pass. Full Fabric deployment is
separately documented and tested when available, never misrepresented by an in-memory
fixture. Documentation, benchmark output and demo assets correspond to tested code.

## Work log

- Baseline: npm audit reports zero vulnerabilities in six maintained npm projects;
  80 existing tests pass, frontend builds and backend lint passes. GitHub reported
  two low alerts on push; their actual advisory state needs independent verification.
- README thesis, architecture, threat model and RWA semantics drafted. Backing registry,
  stable event/transaction replay guards, Gateway acknowledgment reconciliation and oracle
  validation implemented. Rewards now transfer funded claims.
- Python package, strict schemas, two baseline agents, optional read-only Ollama adapter,
  deterministic YAML policies, exact local transaction construction, eth_call simulation,
  isolated local executor and pre-sign/broadcast/confirmation audit snapshots implemented.
- 49 Solidity, 35 Python, 8 Fabric and 18 bridge/Gateway/compatibility tests pass.
  Fifty recorded evals: 90% action-schema validity, 100% safety, 100% correct decisions.
  Invalid outputs intentionally included; this is a finite corpus, not a universal proof.
- Local-chain E2E and Docker Compose simulation pass. Onchain local-market inclusion guards
  added for exposure, trade size, freshness, deadline, backing and slippage.
- Architecture SVG, terminal GIF and 80-second recorded demo generated from real E2E output.
  Final capture regenerated; video duration verified at 79.95 seconds.
- User explicitly chose to apply GitHub description/topics manually. Exact metadata saved
  in .github/repository-metadata.json; no further GitHub authentication is required from agent.
- Live Fabric E2E passed twice, including the pinned Node runtime digest. Real CA
  identities, committed verification/approval and emitted Fabric event reached backed
  Ethereum issuance and guarded agent execution. Only generated test resources removed.
- Clean Git-tree export built from committed lockfiles without node_modules, compiler
  artifacts, local identities or deployment addresses. Compose bootstrap and agent exited
  zero, with approved exact eth_call simulation. Installable wheel benchmark also passed
  outside the repository. Backend 13 tests/lint and frontend 18 tests/build pass.
- Removed generated test identities/addresses from version control while retaining local
  files. Removed the unused Go chaincode alternative: the tested implementation is JavaScript.
  Preserve the user's original fabric-samples binary archive and unrelated containers.
- Published implementation commit 1e004b6f9f7839e748f309cd07be9d24c4117366 on main
  with the configured user identity and no assistant co-author trailer. All four GitHub
  jobs passed: boundaries, dependencies, compose-demo and live-fabric.
  Evidence: https://github.com/Dparini/SustainableFashionChain/actions/runs/37384234420
- All 24 phases are complete within the documented portfolio scope. The user will apply
  prepared GitHub description/topics personally. Local-model quality benchmarks require
  an installed model/server; only recorded adversarial corpus results are claimed.
  Real-money trading, physical redemption and production deployment remain outside scope.

## Presentation refinement

- Lead with the existing physical cotton → Fabric → backed COT → garment →
  ProductNFT → recycling lifecycle. Keep the implemented agent layer as a bounded
  extension; no further feature expansion is planned.
- Use technical, general positioning without naming prospective employers or
  recruiting targets in documentation, commits or metadata.
- README has a real Demo anchor, lifecycle GIF/video, security model and reproducible
  E2E commands. Detailed configuration and dependency notes live in DEVELOPMENT.md.
- Updated description/topics are prepared in .github/repository-metadata.json.
  The user's earlier choice to apply GitHub metadata personally remains in effect.

The scope is now three milestones: presentation of the asset lifecycle, defensible
blockchain boundaries, and the small bounded agent extension. The backing/replay/
oracle controls and agent package already exist; this refinement demonstrates
NFT/recycling through existing bridge handlers rather than adding agent features.
No further feature expansion is planned beyond verification and maintenance.

- Lifecycle fixture E2E, live Fabric E2E and Docker Compose passed with garment NFT
  mint and recycling acknowledgment. The lifecycle video is 79.95 seconds.
- New dependency advisories were detected by the published CI audit and corrected
  with source-map-js 1.2.2 and the scoped YAML parser override. A clean backend
  npm ci, 13 backend tests with coverage, 19 compatibility/boundary tests and 18
  frontend tests/build passed. All six npm audits report zero vulnerabilities.

## Reliability refinement

- Prioritize review, dead-code removal, explicit errors, clean-clone reproduction and demo quality; no new features.
- The supported bridge now reconciles COT/NFT receipts and confirmed recycling with restricted, idempotent Fabric acknowledgments.
- Removed unused experimental contracts and alternate bridge runners. Ledger queries close iterators and reject malformed records.
- Regression tests cover lost acknowledgment, concurrent retries, stream failure, restricted NFT state and corrupt queries. See docs/REVIEW.md.
- Videos now last exactly 80 seconds with chapter transitions, evidence reveal and a progress timeline.

- Removed implicit public API/admin credentials and JWT/session defaults. API keys require explicit configuration; JWT keys are ephemeral or configured and separated by domain. The live runner generates its own reader credential.
- Code commit 4035c1d passed all four CI jobs: https://github.com/Dparini/SustainableFashionChain/actions/runs/37436567364
- Public clean clone passed the Docker Quick Start without edits or copied configuration; bootstrap and agent exited 0, Ethereum stayed healthy, and the checkout remained clean. Validation details are in docs/REVIEW.md.
