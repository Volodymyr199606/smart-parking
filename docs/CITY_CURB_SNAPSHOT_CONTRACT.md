# City Curb Snapshot + Canonicalization Contract V1

Status: offline contract and verification; public capture experiment blocked by HTTP 403. No production migration, ingest, database access, or runtime integration. This refines [curb storage V1](./CITY_CURB_STORAGE.md) for capture consistency, retained artifacts, and canonical digests only. Interval measurement and database publication/immutability guards remain separate blockers. CITY remains **INCOMPLETE**.

## 1. Existing conventions and scope

The existing source registry, generated UUIDs, external text IDs, immutable proposed curb versions, and snapshot membership remain the model. `globalid` is a source label, not proof of physical-curb continuity. The proposed association FK remains `city_parking_curb_versions(id)`, with membership validated against its run's exact target snapshot.

The profiler already uses Node SHA-256 and a shared GET retry helper. Its reverse-insensitive geometry fingerprint is a diagnostic and must not identify interval evidence. There was no canonical JSON serializer or retained capture artifact implementation to reuse. New script-only helpers use Node built-ins and the existing `fetchDataSfJson` retry policy; application and ingest code are unchanged. No dependency or package script was added.

## 2. Deterministic fetch

Provider `datasf`; dataset `pep9-66vw`; proposed registry key `datasf_citywide_curbs` (not registered here).

```text
GET https://data.sfgov.org/api/views/pep9-66vw.json
GET https://data.sfgov.org/resource/pep9-66vw.json?$select=count(*)%20as%20n
GET https://data.sfgov.org/resource/pep9-66vw.json?$select=*&$order=globalid%20ASC&$limit=1000&$offset=0
GET ...same query...&$offset=1000
...
GET ...same query...&$offset=N  (first page with fewer than 1000 rows)
GET https://data.sfgov.org/resource/pep9-66vw.json?$select=count(*)%20as%20n
GET https://data.sfgov.org/api/views/pep9-66vw.json
```

The script uses URLSearchParams; its encoded URLs in the manifest are authoritative (`+` and `%20` both encode spaces). Offset advances by 1000, never by an assumed natural row order. Fetch the terminal short page, including an empty page when the count is an exact multiple of 1000. Maximum 100,000 rows; require explicit terminal completion. No filter, field renaming, geometry transformation or lossy column whitelist. `$select=*` captures all public fields including unknown future attributes; it does not request hidden system fields. Schema changes require review, not silently reverting to an old whitelist.

Socrata documents [ordering by a column with ASC/DESC](https://dev.socrata.com/docs/queries/order.html) and warns that results have no implicit ordering. `globalid` is the observed text identity column, making `$order=globalid ASC` the proposed unique ordering. This experiment could not validate that query against the live endpoint because metadata GETs received 403. Do not claim live order support was demonstrated. Capture verification requires strict increasing verbatim IDs under UTF-16 ordering; the observed UUID-like ASCII labels have compatible ordering. If future source collation/labels disagree, flag the capture for review rather than normalizing labels or continuing silently.

Public unauthenticated GETs only. Reuse five attempts maximum per request for HTTP 425/429/500/502/503/504 and the helper's recognized transient network errors. Backoff is 1/2/4/8 seconds; Retry-After is a minimum, with values above 60 seconds causing failure. Non-retryable responses, malformed JSON and precision failures stop. A 45-second per-attempt abort is an additional bound and is terminal under the current helper. Pause 300 ms between successful requests. No automatic restart of a whole capture and no polling loop. Compare at most two complete captures per invocation.

## 3. Consistency and change detection

Before and after fetch, retain complete metadata and exact count responses. Compare:

- Source count before/after and fetched row count.
- Present, non-placeholder, unique verbatim external IDs across all pages.
- Strict ID ordering within/across page boundaries, exact offset sequence and terminal page.
- Schema digest: sorted public `(fieldName, dataTypeName)` pairs plus source namespace, `shape`, `OGC:CRS84`, and longitude/latitude axes.
- Full canonical metadata digests, including catalog `rowsUpdatedAt`, `viewLastModified`, descriptions and other exposed metadata. This deliberately may flag harmless catalog changes; metadata byte-format differences alone do not matter.
- For independent captures: external-ID set, feature digests, dataset digest, schema and metadata observations.

| State | Meaning |
|---|---|
| `CONSISTENT` | All implemented completeness/order/identity checks pass and before/after observations agree; no detected change |
| `POSSIBLY_CHANGED_DURING_CAPTURE` | Valid captured JSON/identities, but count, schema, metadata, or ordering observations disagree |
| `INVALID` | Fetch/parse/precision/identity failure, missing/duplicate IDs, invalid response shape, safety-cap failure, missing artifacts, or corrupted reconstruction |

Unsupported geometry can still be hashed and preserved in a consistent capture, but fails its separate geometry publication gate. A consistent empty dataset is also ineligible until reviewed. Failure output is `failure.json` with completed artifact descriptors and reasons; it is never a successful/current snapshot. Successful manifests exist for both consistent and possibly-changed completed captures, making the disagreement inspectable.

**No transactional snapshot guarantee was established.** Ordered pagination, stable counts and unchanged catalog timestamps cannot exclude same-count replacements, edits between pages, delayed metadata, or edits reverted between observations. Duplicate/order checks catch some page drift; they cannot prove that every fetched row coexisted at one instant. Two equal independent captures strengthen observed reproducibility but do not establish isolation, freshness or city completeness. `CONSISTENT` means observed agreement under `curb-snapshot-v1`; future publication must explicitly accept that limitation or obtain an immutable export/revision guarantee. No historical DataSF API availability is assumed.

## 4. Minimal retained artifact

Recommended hybrid: authoritative response bodies plus canonical manifest; optional compression at rest. Reconstructed canonical JSON/JSONL can be a derived cache, but is unnecessary authoritative duplication and is not written by this implementation.

```text
capture/
  metadata-before.json
  count-before.json
  pages/000000.json
  pages/001000.json
  ...
  count-after.json
  metadata-after.json
  manifest.json
  manifest.sha256
```

Raw files contain exact HTTP entity-body bytes returned by Node fetch **after HTTP content decoding**. They are not compressed network-wire bytes; selected Content-Encoding headers are observations, not instructions to decompress again. Preserve UTF-8 spelling, number lexemes, whitespace and key order in these files. Fatal UTF-8 decoding, no BOM, and strict JSON validation precede canonical use. Limits: 32 MiB per parsed body, depth 100, numeric token length 256. A response can be downloaded before the parsed-body bound is checked; this research client is not a general untrusted-stream ingestion service.

Exact-source audit uses retained bytes and individual SHA-256 checksums. Feature reconstruction parses the pages with the pinned strict parser; canonical feature/dataset hashes use those parsed values. Formatting-only changes may alter raw page/archive digests while leaving feature/dataset digests unchanged. Neither a current URL nor a checksum without its bytes is sufficient retention.

## 5. Manifest contract

`manifest.json` is canonical JSON plus one LF. `manifest.sha256` is SHA-256 of those exact bytes plus a terminal LF in the checksum file. The manifest does not hash itself. The future DB snapshot row must retain the manifest URI and checksum independently; a mutable sidecar alone is not tamper-proof authenticity.

| Fields | Contract |
|---|---|
| `format_version`, `canonicalization_version` | `curb-snapshot-v1`, `curb-jcs-v1` |
| `provider`, `dataset_id`, `source_key`, `api_endpoint` | Explicit source namespace and proposed registry key; no internal UUID invented |
| `captured_at_start`, `captured_at_end` | UTC ISO observation times, not physical validity times |
| `query` | `select=*`, `order=globalid ASC`, page size/offset step 1000, filter null |
| `fetch_tool_version`, `tool_sources_sha256`, `node_version` | Capture policy version, ordered script-source checksum envelope, actual runtime version |
| `body_representation` | Exact decoded HTTP-body interpretation |
| `artifacts[]` | In request order: relative path, exact URL, byte length, SHA-256, retrieval time, success status, selected headers |
| `retry_events`, `retry_count` | Helper messages and retry count; no authentication data |
| `raw_pages_sha256` | Hash of ordered `[path, byte_length, sha256]` page tuples under `raw-pages` domain |
| `summary` | State; row/distinct/usable counts; ordered flag; source counts before/after; schema/metadata digests before/after; dataset, identity-geometry and external-ID digests; local eligibility |

Metadata and count artifacts hold the full before/after observations without duplicating them into the manifest. Selected headers are Content-Type, Content-Encoding, ETag, Last-Modified and Date where available; none is treated as a transactional revision token. Capture times/retries/raw formatting do not enter feature or logical dataset digests. Two identical source sets observed later remain two snapshot observations while reusing version content.

`tool_sources_sha256` hashes the ordered `[filename, file_sha256]` list for capture, canonicalization and retry modules. Retain those exact source revisions and runtime information with the future artifact collection; a hash does not itself preserve the tool. Local offline verification confirms body checksums, query/page sequence and recomputed content/consistency summary. It is a reconstruction checker, not the full future database publication or authenticity gate.

## 6. Canonical input and serialization

The offline helper implements the [RFC 8785 JCS](https://www.rfc-editor.org/rfc/rfc8785.html) ordering/serialization approach with stricter source-number acceptance. Plain objects sort decoded keys recursively by unsigned UTF-16 code units; integer-looking keys follow that order too. Strings preserve code points without Unicode normalization; invalid surrogates fail. Arrays preserve all elements and order. Booleans/null retain JSON values. Output is UTF-8 without inter-token whitespace. Only JSON data is allowed: no undefined, bigint, non-finite numbers, sparse arrays, accessors, custom objects or hidden properties.

The raw parser detects duplicate decoded object names before materialization, including escaped aliases. Missing attributes remain absent and differ from explicit null. `__proto__` is ordinary data. Reject invalid UTF-8, BOM, malformed/trailing JSON, and invalid Unicode rather than replacing/coercing it.

**Precision contract:** the decimal value of each original number token must equal the decimal value of ECMAScript's serialized binary64 parse result, ignoring insignificant trailing zeros/exponent spelling and the sign of zero. Thus `1.00`, `1e0` and `1` agree; `-0` becomes `0`; `0.1` is accepted. This is a decimal round-trip test, not a claim that 0.1 has an exact finite binary representation. `0.10000000000000001`, `9007199254740993`, overflow and underflow-to-zero are rejected rather than silently rounded. Raw bytes retain all spelling. Source coordinates are never deliberately rounded; a precision-bearing decimal change either hashes differently or fails this contract. This restricted input profile is not a universal arbitrary-precision JSON implementation. Pure functions receiving already-parsed JS numbers cannot recover lost source precision; retained source pages must always enter through `parseSourceJson`.

## 7. Exact digest constructions

Define `H(domain, value) = SHA256(UTF8("city-curb/" + domain + "/v1\n" + canonicalJson(value)))`, lowercase hex. SHA-256 implementation is Node `crypto`. JSON envelopes avoid ambiguous string concatenation of values. Hashes are identifiers/checks, not signatures.

For one source row:

```text
geometryEnvelope = {presence:"ABSENT"}                       if shape absent
                 = {presence:"NULL"}                         if shape is null
                 = {presence:"VALUE",value:row.shape}         otherwise
geometry_sha256   = H("geometry", geometryEnvelope)
attributes_sha256 = H("attributes", all row fields except shape)
content_sha256    = H("content", {
  provider:"datasf", dataset_id:"pep9-66vw", external_id:row.globalid,
  canonicalization_version:"curb-jcs-v1",
  geometry_sha256, attributes_sha256
})
```

Geometry is the **entire GeoJSON object**, including unknown members, not coordinates alone. Preserve geometry type, coordinate precision, vertex order and direction. Never reverse, sort, snap, simplify, project, remove repeated vertices, or equate LineString with MultiLineString. Added/removed vertices and direction reversal change the hash. The separate gate initially supports nonzero 2D LineStrings with at least two valid WGS84 positions; malformed/missing/unsupported values remain hashable evidence but are not eligible targets.

Attributes include **every field except `shape`**, including `globalid`, `shape_leng`, `popupinfo`, unknown attributes and original value types. No field is excluded for being poorly understood or seemingly derived. Missing/null, number/string, case and Unicode differences remain visible. Transport metadata is outside the returned row and is retained in its own artifacts.

For a set, sort feature records by verbatim `external_id` in unsigned UTF-16 order, without locale collation. Let `base={provider:"datasf",dataset_id:"pep9-66vw",canonicalization_version:"curb-jcs-v1"}`:

```text
dataset_sha256 = H("dataset", {...base,
  features: sorted [external_id, content_sha256] pairs})
identity_geometry_sha256 = H("identity-geometry", {...base,
  features: sorted [external_id, geometry_sha256] pairs})
external_ids_sha256 = H("external-ids", {...base,
  external_ids: sorted external IDs})
schema_sha256 = H("schema", {provider:"datasf",dataset_id:"pep9-66vw",
  fields: sorted [public fieldName,dataTypeName] pairs,
  geometry_field:"shape",crs:"OGC:CRS84",axes:"longitude,latitude"})
metadata_sha256 = H("metadata", complete parsed metadata body)
raw_pages_sha256 = H("raw-pages", ordered [path,byte_length,sha256] tuples)
```

The storage-design name `source_content_sha256` maps to `dataset_sha256` here; they are one value, not competing algorithms. Schema descriptors exclude hidden `:` columns, include all public fields, and reject duplicate field names. Formatting/key order cannot affect these logical digests. Page order/size/raw formatting can affect the archive digest; source row order cannot affect dataset identity.

Missing, null, blank, placeholder or non-string `globalid` rejects the feature/set. Do not trim or normalize valid IDs. Duplicate IDs reject the whole set even if contents agree; no last-write-wins, auto-deduplication, UUID fallback or geometry-based identity invention. Equal hashes must still have matching canonical content before future version reuse; digest disagreement/collision is an error.

## 8. Change semantics

| Across snapshots | Future version/membership outcome |
|---|---|
| Same ID + same content | Reuse version under same source/canonicalization contract; add new snapshot membership |
| Same ID + changed attribute | New version, same external label; historical membership unchanged |
| Same ID + changed geometry | New version; old interval evidence stays on the old version |
| ID disappears | Absent from new complete membership; retain old version/history |
| New ID appears | New source-feature version/membership, no physical lineage assertion |
| Same geometry/other attributes + new ID | Separate version; geometry hash may agree, but external identity/content hash differs |

Changing only metadata/capture formatting need not create feature versions. Reappearance with identical content can reuse a version but never transfers association approval. Dataset equality means the same namespaced recorded content under this contract, not physical continuity, a renewed field survey, or CITY readiness.

## 9. Future publication gate and retention

Before any future snapshot publication require: completed manifest; acceptable observed consistency; independently verified archive checksum/restore; full valid counts; nonempty unique IDs; reviewed schema; supported usable geometry for every publishable target; complete recomputed digests; pinned tools/contract; and durable retained artifacts. The implemented `locally_eligible` flag covers only observed consistency, nonempty inventory and geometry usability; it is **not production publishability**. A failed/partial capture must never become current. Publication requires the separate transaction/immutability guards, not a caller asserting this flag.

Prefer a provider-neutral private object store with immutable naming such as `city-curb/pep9-66vw/sha256/<manifest-sha256>/...`. Publish the root manifest reference only after all named bodies are stored and verified. Optional compression/archive packaging gets its own byte checksum; preserve checksums of original decoded bodies. Do not upload here or put full source archives in Git. Supabase Storage is a possible later provider, not selected or configured by this task. Local temp directories are research evidence only, not production retention.

Retain manifests, bodies, metadata and exact tool revisions for at least as long as any historical association/snapshot relies on them; do not apply a routine expiry to referenced evidence. Use access controls, backup/restore checks and deletion restrictions. The DB snapshot holds the immutable manifest URI, checksum, format/canonicalization versions and audit counts; dataset digest alone cannot distinguish separate captures. Backend selection, operational retention and restoration must be provisioned and demonstrated before actual publication.

## 10. Verification and readiness

Commands:

```text
pnpm.cmd exec tsx scripts/verify-curb-canonicalization.ts
pnpm.cmd exec tsx scripts/capture-curb-snapshot.ts --compare --out=<NEW absolute directory outside Git>
pnpm.cmd exec tsx scripts/capture-curb-snapshot.ts --verify=<capture directory>
pnpm.cmd typecheck
git diff --check
git status --short
```

Verification result: **32 offline checks passed**, including identity rejection, key order/whitespace, ordered geometry changes, attributes/unknown fields, missing/null, dataset row order, numeric/Unicode edge cases, schema change, geometry eligibility and capture state transitions. Synthetic raw-page archive reconstruction passed; corrupted bodies, changed queries and inconsistent manifest content digests were rejected. Fixtures are created in a new system temporary directory, outside Git, and left valid for optional replay. `pnpm.cmd typecheck` passed across all workspaces and scripts. No test framework or runtime exports were added.

Live result in this milestone: public metadata GET returned HTTP 403 both inside the sandbox and in one escalated attempt. Neither fetched source rows; no complete capture or double-capture equality is claimed. Stop after that bounded failure rather than repeatedly retrying a non-retryable response. The existing 18,355-row observation remains the prior milestone's evidence, not a new verification. Live ordered pagination, successful artifact reconstruction on current DataSF bytes and cross-capture equality remain unverified.

Resolved at contract level: deterministic query/pagination policy, conservative consistency states and explicit isolation limits, authoritative archive/manifest and retention requirements, exact canonicalization/hash rules, and offline conformance implementation. Not resolved operationally: successful live capture validation and deployed durable artifact retention. **Curb migration remains deferred and must not be created in this milestone.** Interval measurement conventions and database publication/immutability enforcement are still required; no association approval, physical-curb continuity, coverage readiness or runtime switch follows from canonicalization.
