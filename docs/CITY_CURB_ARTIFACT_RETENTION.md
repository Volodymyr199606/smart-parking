# City curb durable artifact contract and full archive verifier V1

This milestone implements **local/offline full archive verification** for `curb-decimal-v2` / `curb-snapshot-v2`. It defines retention requirements; **true durable retention is not configured**. No production database, DataSF request, real staging/publication, migration or runtime change is part of this work. CITY remains INCOMPLETE.

## Existing package and evidence authority

Preserve the actual successful capture layout; do not rename files or rewrite existing manifests:

```text
<snapshot package>/
  manifest.json
  manifest.sha256
  metadata-before.json
  count-before.json
  pages/
    000000.json
    001000.json
    ...                    # offset, not page ordinal; step 1000
    018000.json            # this retained capture only
  count-after.json
  metadata-after.json
```

The first short page is mandatory, including an empty terminal page for exact multiples of 1,000. `manifest.artifacts` order is metadata-before, count-before, consecutive pages, count-after, metadata-after. A failed capture's `failure.json` is diagnostic evidence, not a successful package. Parent-level `comparison.json` and maps from previous diagnostics are not package members.

| Evidence | Authority |
|---|---|
| Four metadata/count response files and all page files | Authoritative **retained source evidence**: exact HTTP entity bytes after Fetch content decoding, not compressed wire bytes. Source numerics are parsed losslessly. |
| `manifest.json` | Derived descriptors, URLs, timestamps, versions, query, checksums and summary. Every recomputable claim is checked; declarations do not authenticate themselves. |
| `manifest.sha256` | Derived SHA-256 of exact manifest bytes, lowercase hex plus LF. Detects accidental damage; an attacker can rewrite it. |
| Reports and membership input exports | Derived verification outputs, written outside the package. They are neither source evidence nor DB attestations. |

The manifest already indexes each raw file with its byte count and SHA-256, so another `checksums.json` is unnecessary. The verifier recomputes those values; it does not accept that index as proof. Its exact inventory rejects undeclared files, missing/duplicate/reordered page declarations and unexpected files in `pages/`. Files/directories must not be symlinks. Use an immutable, private local materialization while replay runs; this is not a defense against an administrator concurrently replacing filesystem objects.

Offline replay can establish consistency with retained bytes and externally trusted checksums. It **cannot authenticate an HTTP origin**, independently prove capture timestamps/headers/tool provenance, or detect a coherently forged replacement package without an independently retained checksum. Metadata must identify `pep9-66vw`; provider, source key and endpoint must match the pinned contract. `CONSISTENT` remains observed agreement, not transactional source isolation, freshness or complete city coverage.

## Deterministic object identity

Package contract: `curb-artifact-package-v1`. Exact preimage:

```text
SHA256(UTF8("city-curb/artifact-package/v1\n") + UTF8(canonicalJson({
  contract: "curb-artifact-package-v1",
  manifest: {path: "manifest.json", bytes: <actual length>, sha256: <actual SHA256>},
  raw: [ {path: <relative logical name>, bytes: <actual length>, sha256: <actual SHA256>}, ... ]
})))
```

`raw` uses the fixed capture sequence above; `canonicalJson` is the existing V2 serializer. Only package-relative logical names enter identity: drive letters, mount paths, provider URIs and object versions do not. Manifest bytes are hashed exactly, including final LF; changing manifest formatting/provenance changes package identity. `manifest.sha256` is redundant and verified separately, avoiding a circular hash. The package digest is independent of zip/tar encoding and is **not a hash of compressed container bytes**.

The original `raw_pages_sha256` remains `digest("raw-pages", [[path, bytes, sha256], ...])` in the existing V2 domain and order. It excludes metadata/count responses and is insufficient as full-package identity. Historical checksums are never reinterpreted or overwritten. New packages using this contract bind `artifact_sha256` to the full logical package digest and `manifest_sha256` to exact manifest bytes.

For a future transported zip/tar, retain a separate transport-object byte checksum/version in the provider receipt. Unpack safely into a fresh directory, then verify the logical package. Neither provider ETags nor tar checksums substitute for the package digest. Optional report timestamps never affect package/content identity.

## Local verifier and report

Implementation: [`verify-curb-snapshot-archive.ts`](../scripts/verify-curb-snapshot-archive.ts). Imports are Node filesystem/path/crypto and the existing pure canonicalization, lossless-number and eligibility modules. It does not import capture/fetch code, load environment files, use a Supabase SDK, or access the network.

```powershell
pnpm.cmd verify:curb-archive --archive=<retained-directory> --out=<NEW-output-directory>
pnpm.cmd verify:curb-archive --archive=<retained-directory> --expected-artifact-sha256=<trusted-hex> --expected-manifest-sha256=<trusted-hex>
pnpm.cmd verify:curb-archive-tests
```

Checksums supplied on the command line must come from independent trusted state, not be copied unquestioningly from that package. They are optional for local discovery/replay; **both are mandatory inputs to the later independently authenticated verification process**. Report fields explicitly indicate which external checks were performed.

The verifier checks:

- Exact V2 source/provider/key/endpoint, versions, query, capture tool tag and descriptive timestamp ordering; lossless manifest control parsing permits only exact safe integers.
- Manifest bytes/checksum; fixed raw inventory/order and URLs; every file length and checksum, HTTP-success declaration and retrieval chronology; raw JSON syntax, duplicate keys, Unicode and numeric bounds.
- Metadata identity/schema/full metadata digests; before/after count response parsing; page size/offset/terminal bounds; every nonblank globalid, strict order across pages and uniqueness.
- Every feature's geometry/attribute/content hashes, complete external-ID set, dataset and identity/geometry digests; all original summary fields and raw-pages digest must agree with independent recomputation.
- Every row's `curb-db-eligibility-v1` result. No ineligible row is silently removed. `summary.locally_eligible` retains its original capture/geometry meaning and cannot substitute for DB eligibility.

Bounds: manifest <=1 MiB; each response <=32 MiB; manifest plus response bytes <=256 MiB; <=100,000 rows; <=101 pages (including terminal); existing parser depth/numeric bounds. Errors name the relative artifact/control path without dumping values or payloads. Full per-feature exports are bounded by the archive limits, not embedded into the compact report.

Successful integrity replay generates `verification-report.json` containing verifier contract `curb-archive-verify-v1`, implementation `1.0.0` and a SHA-256 fingerprint of verifier/codec/decimal/eligibility source files, `verified_at`, source identity, contracts, package/manifest/raw-pages/content hashes, counts, recomputed consistency inputs, external-anchor flags, eligibility counts/reason frequencies (occurrences), and at most 16 rejection samples with JSON Pointer paths truncated to 256 characters. `status` is PASS only for a consistent, nonempty archive with all rows eligible. An intact but ineligible/inconsistent archive returns FAIL with its recomputed evidence; an integrity/structure failure produces a bounded FAIL report and exits nonzero without a member export. There is no DB success assertion: `database_membership_seal=null` and `database_attestation_ready=false`.

With `--out`, outputs go into an exclusively created directory outside the archive. Existing outputs are not overwritten. `membership-inputs.json` contains contract `curb-archive-content-v1` and each exact `external_id`, `geometry_sha256`, `attributes_sha256`, `content_sha256`; it contains no geometry Numbers, database UUIDs or credentials. Reports are reproducible under the same implementation except for `verified_at`.

## Archive seal versus database membership

Archive content seal `curb-archive-content-v1` is:

```text
SHA256("city-curb/archive-content/v1\n" + canonicalJson({
  provider: "datasf", dataset_id: "pep9-66vw", source_key: "datasf_citywide_curbs",
  canonicalization_version: "curb-decimal-v2", snapshot_version: "curb-snapshot-v2",
  features: [[hex(UTF8(external_id)), geometry_sha256, attributes_sha256, content_sha256], ...]
}))
```

Tuples sort by UTF-8 hex identity; duplicate IDs reject. The seal is based on recomputed feature hashes, independent of artifact formatting, location, timestamps or DB allocation. It binds the complete content, while the package checksum binds the exact evidence package.

The **database membership seal** remains [`membershipSealV2`](../scripts/curb-v2-membership-seal.ts): its header binds source UUID, snapshot UUID and contract versions; each tuple additionally includes the actual immutable curb-version UUID. Archive content cannot know those UUIDs before staging. Neither dataset hash nor archive seal may be passed as `membership_sha256`.

## Independent verifier handoff (design, no credentials or DB integration)

The later independently authenticated process requires trusted:

1. Immutable artifact URI (and provider object version/transport receipt), expected **package** checksum, manifest URI and expected exact manifest checksum.
2. Snapshot UUID and source UUID, expected source identity and all supported contract versions: package V1, archive verifier V1, canonicalization V2, snapshot V2, eligibility V1, DB artifact verifier `curb-artifact-verify-v2`.
3. Separate verifier authentication/execution, with permission to read complete snapshot membership and authoritative version TEXT and call the verifier-only attestation RPC. A service-ingest credential is not an independent verifier identity.

Fetch/materialize through the future artifact adapter, verify upload receipts, then invoke this offline verifier with **both trusted checksums**. Require PASS and compare the pinned DB snapshot manifest/source/row counts/digests/URIs with that report. Read every DB member under the exact source/snapshot; losslessly reconstruct every authoritative version from the existing TEXT read RPC. Compare the full identity set, all source content and all three independently recomputed hashes. Check version/source/identity and collect actual version UUIDs only after exact matching. Compute the V2 DB seal from that verified member set.

Only then assemble the exact 00014 evidence object for `attest_city_parking_curb_snapshot_v2(source_uuid, snapshot_uuid, evidence)`:

```text
artifact_sha256, manifest_sha256, dataset_sha256, identity_geometry_sha256,
row_count, distinct_external_id_count,
membership_sha256 = verified database membership seal,
eligibility_version = curb-db-eligibility-v1, eligibility_state = ELIGIBLE,
eligible_row_count, ineligible_row_count = 0,
canonicalization_version = curb-decimal-v2, snapshot_version = curb-snapshot-v2,
verifier_version = curb-artifact-verify-v2
```

The archive report is the complete offline half of this evidence, **not itself sufficient authorization to attest**. Do not merely attach UUIDs read from unverified DB rows. The database transaction rechecks the current complete set/seal, rejecting changed staging between replay and attestation, and atomically freezes accepted membership. Independently provisioned session identity and the operational adapter/full DB comparison remain rollout work; this milestone adds neither credentials nor network execution.

## Provider-neutral retention and future interface

Existing 00012 fields `artifact_uri`, `artifact_sha256`, `manifest_uri`, `manifest_sha256`, and immutable `manifest` plus the 00014 attestation binding are sufficient. No migration is required. URIs must satisfy the existing scheme/authority/no-space/no-query/no-fragment constraint. New package keys include the contract version: `s3://bucket/curb/curb-artifact-package-v1/<package-sha>/`, equivalently `gs://...` or `supabase-storage://...`; `file:///...` is local testing only. Pin that contract in the trusted retention receipt/verifier job as well; do not reinterpret historical artifact hashes. Use provider-native immutable versions or encode version identity in the object key/receipt; never store expiring signed URLs or credentials in DB evidence. The artifact URI resolves the logical package; the manifest URI identifies its exact manifest object. No production provider is selected.

Minimal future interface, **design only**, with no cloud SDK dependency:

```typescript
interface ArtifactStore {
  putImmutable(localPackage: string, objectKey: string, expectedPackageSha256: string): Promise<Receipt>;
  head(objectKey: string, immutableVersion: string): Promise<Receipt>;
  get(objectKey: string, immutableVersion: string, newLocalDirectory: string): Promise<void>;
  verifyChecksum(objectKey: string, immutableVersion: string, expectedPackageSha256: string): Promise<void>;
}
// Receipt: provider-neutral immutable URI/version, manifest URI/hash, package contract/hash,
// raw-file inventory, actual object-byte hashes/sizes, retention/deletion-protection evidence.
```

Operational acceptance requires all of:

- Write-once content-addressed package keys; conditional creation must fail on collisions with different bytes. No overwrite after publication, including manifests and historical versions.
- Upload all members, verify actual checksums by retrieval, then make the complete package discoverable using an atomic completion marker/receipt. A partially uploaded prefix must never qualify as retained.
- A trusted independent retention receipt mapping the package hash to immutable provider versions, manifest checksum and object-byte checksums; ETags alone do not prove SHA-256.
- Retention for every published snapshot for its entire supported audit/history lifetime. Deletion protection/object lock and IAM separation must prevent ingest workers from deleting or shortening retention. Lifecycle rules must preserve historical evidence.
- Restore/recoverability testing using a separate clean environment and only immutable references/expected hashes; full offline replay must pass after download. Monitor retention settings and object availability, and periodically repeat recovery.
- Independent verifier access, durable receipt backups, historical URI/version retrieval, documented provider failure/backup recovery, and a reviewed retention duration/operational ownership policy.

Local temp files, a successful hash calculation and a provider-neutral URI design do not meet those requirements. **Durable retention remains BLOCKED** until a real provider is configured and these acceptance tests succeed.

## Local verification evidence

The generated corruption harness covers manifest lies (counts, digests, checksum, byte length, versions, identity and page declaration order), altered coordinates/bytes/globalids/metadata/counts, deleted/duplicated/swapped/truncated pages, and altered bodies whose descriptors were rehashed. It also checks external checksum anchors, archive relocation, deterministic replay, strict lossless control parsing, complete eligibility failure, terminal empty pages, content-seal inputs, exclusive external report writes and no invented DB UUIDs. Networking functions are disabled during the harness, including optional retained-archive replay.

The retained archive at `%TEMP%/curb-v2-double-02753736130e4c279273764268ef070d/a/capture-1` was used directly without refetch or modification. Both runs passed: 18,355 rows/unique IDs, 18,355 eligible, zero ineligible, dataset `f536717d946b36d19bfcb9ae2d7ca0e753fe09e4e08e3bde1356ad0c6c5216a2`, identity/geometry `3051d88c0c71122a0945903c268a4db07431dc258d93aa575366fcc9e13202c6`. Every report field except `verified_at` and every member input matched exactly. There were 19 pages, 23 raw response files and 7,710,712 raw bytes.

Package checksum: `e019f4534e993f11db4043b00fd5a201600c9d569637ec13012ac62e77d55ca4`. Manifest checksum: `f60ec7819866fbd4e894500714ebc84c567ea742ea8e6bef2a0f782a6bc3bee2`. Archive-content seal: `440ebdaf61532e3a6787e28dfada6f33dace43fa7b0bf9ce244c481a794ac1bf`. Reports and full membership inputs from the final verifier are retained locally in `%TEMP%/curb-archive-verification-v1-final-20260923/{first,second}/`; these outputs themselves are not durable retention. CLI checks also accepted the expected package/manifest hashes and returned a bounded FAIL report with exit code 1 for a wrong expected manifest checksum.

The archive suite passed **60 synthetic checks plus the full real-archive double-replay check (61 total)** with networking disabled. Required regression checks passed: workspace/scripts typecheck, canonicalization **100 V2 + 34 V1**, interval **38**, DB eligibility **33**, publication static/protocol **41**. No DB suite or migrations were run for this offline-only milestone.

Remaining production blockers: actual immutable storage and recovery proof; independent verifier credentials/deployment and complete DB TEXT comparison/attestation integration; reviewed migration/source-registration/endpoint rollout and ingest/publication authorization. No real curb snapshot is published here.
