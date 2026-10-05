# Cotton claim and backing model

**1 COT = a claim representing 1 kg of verified cotton.** One whole COT is
10^18 ERC-20 base units. Registry `verifiedKg` and `tokenizedKg` use the same
scale. USD test collateral uses six decimals; the demo feed uses eight.

```typescript
interface CottonBatch {
  batchId: string;
  origin: string;
  producer: string;
  quantityKg: number;
  certificationHash: string;
  createdAt: string;                 // Fabric transaction time, milliseconds
  verifiedAt: string | null;
  fabricVerificationTxId: string;
  rwaStatus: "PRODUCED" | "VERIFIED" | "TOKENIZED" | "CONSUMED";
}
```

Fabric keeps the original storage/custody status and a separate RWA state. The
certifier identity must carry `sfc.role=certifier`; acknowledgments need
`sfc.role=bridge`. The certifier checks storage and certification, binds the
quantity and inspection hash, and emits a verification event. Generic product
updates cannot replace RWA fields. Duplicate registrations, pending requests,
warehouse mismatches and nonfinite quantities fail before issuance.

An Ethereum attestor independently mirrors the verified batch into
CottonReserveRegistry. The relay has `BRIDGE_ROLE` on CotToken, without
`ATTESTOR_ROLE` on the registry. Each mint consumes batch capacity atomically.

```
Physical batch ↔ Fabric batch and verification tx ↔ authorized reserve attestation
             ↔ approved Fabric event ↔ Ethereum mint receipt and COT supply
```

Event identity is:

```solidity
keccak256(abi.encode(fabricTxId, keccak256(bytes(batchId)), amount, "MINT_COT"))
```

The token stores both event IDs and consumed Fabric transaction IDs. Replaying
the same event reverts `EVENT_ALREADY_PROCESSED`; changing amount or batch while
reusing the Fabric transaction reverts `FABRIC_TX_ALREADY_PROCESSED`. Separate
contract deployments have separate replay domains and reserves: operating multiple
registries against the same physical cotton requires consortium-level coordination.

All issuance routes require backing. The retained administrative `mintBatch`
entry point consumes registered capacity; `mintTo` always rejects unbacked minting.
CircularRewards transfers pre-funded COT instead of creating claims.

`totalSupply <= totalVerifiedKg` and per-batch cumulative issuance <= verified
capacity hold even across multiple events. Ordinary token burns do not release
reserve capacity. Issued reserves cannot be deactivated or reduced below cumulative
issuance. This conservative rule prevents a burn from authorizing another claim
on the same cotton. A physical redemption/consumption protocol is not implemented;
`CONSUMED` is reserved for that future terminal lifecycle transition and must not
be inferred from generic ERC-20 burns or NFT creation.

These are **proof-of-backing attestations**, not proof of existence, legal ownership
or a trustless Fabric-to-Ethereum light client. False inspection, a compromised
attestor and duplicate physical backing across deployments remain trust risks.
