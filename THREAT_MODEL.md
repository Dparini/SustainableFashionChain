# Threat Model

Scope: verified cotton issuance and the agent proposal → policy → simulation →
executor path. This is a portfolio demonstration, not an audited financial product.
Controls below are implemented boundaries; verification evidence is tracked in
[PROJECT_DIRECTION.md](docs/PROJECT_DIRECTION.md).

| Threat | Attack | Impact | Mitigation | Residual risk |
| --- | --- | --- | --- | --- |
| Forged API credentials | Use published prototype JWT keys or default admin login | Unauthorized ledger access | No default API/admin credentials; ephemeral or configured secrets; domain-separated token keys | Configured key theft and host compromise |
| Compromised LLM | Deliberately malicious proposal | Unauthorized trade | Strict action schema, independent deterministic policy, no model signing tools | Valid but poor decisions can pass bounds |
| Prompt injection | Supplier text instructs asset transfer | Asset theft or corrupted proposal | Treat text as data; no destinations/calldata in action schema | Can affect proposal quality; rejection must be tested |
| Hallucinated transactions | Unknown action, extra recipient or malformed numbers | Arbitrary execution | Reject unknown fields/actions, finite Decimal validation, fixed transaction builder | Builder or schema implementation bugs |
| Stale oracle | Replay an old favorable price | Trade at obsolete valuation | Missing, future, incomplete and >3600s observations rejected; local market repeats freshness at inclusion | Compromised feed or RPC |
| Manipulated oracle | Fresh incorrect price | Loss despite policy approval | Validate rounds, denomination and bounds; compare execution quote with oracle | Feed compromise or correlated manipulation |
| Bridge replay | Redeliver a Fabric event after restart | Double mint | Stable event ID and onchain consumed-event mapping | Misconfigured IDs or attestor collusion |
| Double mint | Use different event IDs for the same backing | Excess token supply | Per-batch consumed capacity and global backing invariant on every mint path | Fabric truth can be falsely attested |
| Fabric/Ethereum desynchronization | Ethereum commits but Fabric acknowledgment fails | Duplicate work or inconsistent state | Reconcile processed event on retry; wait confirmations; audit tx hashes | Reorgs, downtime and failed reconciliation |
| Compromised executor | Bypass checks inside signer process | Asset loss | Local-chain allowlist, fixed contracts/actions, bounded allowance, revalidation | Executor key compromise remains outside the agent policy protection boundary |
| Private-key compromise | Exfiltrate signer/attestor key | Unauthorized transactions or forged backing | Separate roles; keys excluded from model inputs, logs and repository | Host compromise and poor credential management |
| Liquidity manipulation | Drain/manipulate pool before inclusion | Excess slippage or MEV | Minimum liquidity, quote/price bounds, onchain minOut and deadline | RPC inconsistency, sandwiching within allowed slippage |
| RWA backing mismatch | Certify nonexistent/consumed cotton | Insolvent claims | Authorized certification, immutable provenance hash, reserve capacity checks | No software can directly prove physical existence or legal title |

## Security invariants

1. COT total supply cannot exceed attested verified cotton capacity.
2. Each stable Fabric event can mint on Ethereum at most once.
3. Models cannot execute an action outside HOLD, BUY_COT and SELL_COT.
4. No guarded execution accepts missing, stale or future oracle data.
5. Post-trade exposure and size remain inside configured policy limits.
6. A failed simulation or mismatched transaction/state cannot authorize execution.

## Operational boundary

Backing attestations are authorized assertions, not trustless Fabric light-client
proofs. Generic burns do not free reserve capacity. Attestor/admin compromise can
raise the cap with false data. Unsupported sidechain/state-channel prototypes were
removed; the relay does not claim Merkle verification or production cross-chain
consensus. Mainnet execution, legal redemption, custody insurance and
physical audits are deliberately outside the demonstration.
