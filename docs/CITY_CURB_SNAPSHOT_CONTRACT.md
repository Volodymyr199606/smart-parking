# City Curb Snapshot + Canonicalization Contract V1

**Publication follow-up:** [Curb Publication + Immutability Guards V1](./CITY_CURB_PUBLICATION_CONTRACT.md) specifies DB staging/validation/publication, independent artifact attestation and a frozen membership seal. Migration 00012 passed 132 local database behavior checks in the preceding milestone; production was not applied. Database lifecycle states are separate from capture consistency. The live attempt below found a source precision incompatibility and a changed public hostname. The unchanged database manifest/source guards still pin the legacy hostname, so a future compatibility review is also required before publication.

**Interval follow-up:** [Curb Interval Measurement V1](./CITY_CURB_INTERVAL_CONTRACT.md) supplies the offline target measurement, projection/tie and fraction-serialization contract. References below to unresolved interval measurement describe this snapshot milestone's original boundary. Live capture validation and operational artifact retention still block production rollout; interval measurements do not verify associations.

**LIVE QUERY VERIFIED on `data.sf.gov`; DOUBLE CAPTURE NOT VERIFIED; METADATA AVAILABLE on the current host; PRODUCTION PUBLICATION STILL BLOCKED.** On 2026-09-22, two independent attempts each fetched metadata, count and the first 1,000-row page, then correctly became INVALID because source coordinate decimals fail the existing strict binary64 round-trip contract. No precision rule was weakened. This milestone used public DataSF and local files only: no database connection/write, migration, ingest or runtime integration. CITY remains **INCOMPLETE**.

## 1. Existing conventions and scope

The existing source registry, generated UUIDs, external text IDs, immutable proposed curb versions, and snapshot membership remain the model. `globalid` is a source label, not proof of physical-curb continuity. The proposed association FK remains `city_parking_curb_versions(id)`, with membership validated against its run's exact target snapshot.

The profiler already uses Node SHA-256 and a shared GET retry helper. Its reverse-insensitive geometry fingerprint is a diagnostic and must not identify interval evidence. There was no canonical JSON serializer or retained capture artifact implementation to reuse. New script-only helpers use Node built-ins and the existing `fetchDataSfJson` retry policy; application and ingest code are unchanged. No dependency or package script was added.

## 2. Deterministic fetch

Provider `datasf`; dataset `pep9-66vw`; proposed registry key `datasf_citywide_curbs` (not registered here).

```text
GET https://data.sf.gov/api/views/pep9-66vw.json
GET https://data.sf.gov/resource/pep9-66vw.json?$select=count(*)%20as%20n
GET https://data.sf.gov/resource/pep9-66vw.json?$select=*&$order=globalid%20ASC&$limit=1000&$offset=0
GET ...same query...&$offset=1000
...
GET ...same query...&$offset=N  (first page with fewer than 1000 rows)
GET https://data.sf.gov/resource/pep9-66vw.json?$select=count(*)%20as%20n
GET https://data.sf.gov/api/views/pep9-66vw.json
```

The script uses URLSearchParams; its encoded URLs in the manifest are authoritative (`+` and `%20` both encode spaces). Offset advances by 1000, never by an assumed natural row order. Fetch the terminal short page, including an empty page when the count is an exact multiple of 1000. Maximum 100,000 rows; require explicit terminal completion. No filter, field renaming, geometry transformation or lossy column whitelist. `$select=*` captures all public fields including unknown future attributes; it does not request hidden system fields. Schema changes require review, not silently reverting to an old whitelist.

Socrata documents [ordering by a column with ASC/DESC](https://dev.socrata.com/docs/queries/order.html) and warns that results have no implicit ordering. `globalid` is the observed text identity column. The five-row `$select=*&$order=globalid ASC&$limit=5` probe succeeded on `data.sf.gov`; both subsequent first pages also had strictly increasing verbatim IDs under UTF-16 ordering. Full pagination remains unverified because precision validation rejected the first page. If future source collation/labels disagree, flag the capture for review rather than normalizing labels or continuing silently.

The legacy `data.sfgov.org` hostname returned 403 for the ordered/count queries, while metadata and a limit-only query returned 301 to `data.sf.gov`. The current host accepted all three endpoint types. Live capture now pins `https://data.sf.gov`, prints the dataset/host before fetching, permits only the Accept header and refuses redirects. Offline reconstruction accepts either complete legacy-host archives or complete current-host archives; mixed endpoint descriptors reject. Source namespace, field selection, ordering, page size, parser and digest algorithms are unchanged. This is an observed transport compatibility correction, not proof of the exact upstream cause of the legacy nginx 403.

Public unauthenticated GETs only. Reuse five attempts maximum per request for HTTP 425/429/500/502/503/504 and the helper's recognized transient network errors. Backoff is 1/2/4/8 seconds; Retry-After is a minimum, with values above 60 seconds causing failure. Non-retryable responses, malformed JSON and precision failures stop. A 45-second per-attempt abort is an additional bound and is terminal under the current helper. Pause 300 ms between successful requests and 15 seconds between successful Capture A and independent Capture B in `--compare` mode. No automatic restart or polling loop. `--compare` stops if either attempt fails; `--capture` attempts exactly one capture when independent failure evidence is needed.

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
pnpm.cmd exec tsx scripts/capture-curb-snapshot.ts --capture --out=<NEW absolute directory outside Git>
pnpm.cmd exec tsx scripts/capture-curb-snapshot.ts --verify=<capture directory>
pnpm.cmd typecheck
git diff --check
git status --short
```

Verification result: **34 offline checks passed**, including identity rejection, key order/whitespace, ordered geometry changes, attributes/unknown fields, missing/null, dataset row order, numeric/Unicode edge cases, schema change, geometry eligibility and capture state transitions. Synthetic raw-page archive reconstruction passed; corrupted bodies, changed queries and inconsistent manifest content digests were rejected. Added checks preserve legacy archive reconstruction, verify identical logical digests with current-host descriptors and reject mixed hosts. Fixtures remain in system temporary directories outside Git. `pnpm.cmd typecheck` passed across all workspaces and scripts. No dependency, test framework or runtime export was added.

### 2026-09-22 live execution evidence

The earlier environment's metadata 403 is historical. On the current machine/network, the legacy ordered query returned the same 146-byte nginx 403 both inside and outside the sandbox. Literal query parameters/`%20` spaces and a browser-style user-agent also returned that 403. No common proxy environment configuration was present; this does not exclude an OS/network intermediary. The exact upstream policy remains undetermined.

| Endpoint | Legacy `data.sfgov.org` | Current `data.sf.gov` |
|---|---|---|
| `/resource/pep9-66vw.json?$select=*&$order=globalid ASC&$limit=5` | 403 | 200; five unique ascending IDs |
| `/resource/pep9-66vw.json?$select=count(*) as n` | 403 | 200; 18,355 |
| `/api/views/pep9-66vw.json` | 301 to current host | 200; expected dataset metadata |
| `/resource/pep9-66vw.json?$limit=5` | 301 to current host | Not separately probed; ordered rows above succeeded |

Exactly two capture attempts ran. A used `--compare`, which correctly stopped at its first failure; after diagnosing the retained page, B used `--capture` and fetched independently. The gap was diagnostic work, not a scheduled multi-minute pause. Neither attempt completed or produced a successful manifest.

| Observation | A | B |
|---|---|---|
| Start UTC | 2026-09-22T20:59:49.721Z | 2026-09-22T21:02:00.233Z |
| Finish UTC | 2026-09-22T20:59:51.574Z | 2026-09-22T21:02:02.179Z |
| Exit / consistency | 1 / INVALID | 1 / INVALID |
| Before-count endpoint | 18,355 | 18,355 |
| Rows in retained first page | 1,000 | 1,000 |
| Distinct IDs in that page | 1,000 | 1,000 |
| Duplicate / missing / blank IDs in that page | 0 / 0 / 0 | 0 / 0 / 0 |
| Page count / retries | 1 / 0 | 1 / 0 |
| Strict first-page ID order | Pass | Pass |
| Full row count / terminal page / after checks | Not reached | Not reached |

Both before-schema digests equal `e7bc3b8f7e2eb806a95515f4eb61e8e00054ff5cdcef4bdc732ba0fe7c2701bc`. Both first-page byte checksums equal `91abbd31364d92a2194565aeddd460133dadede12e5f30d3e8905eaf708c6289`; the partial raw-page envelope digest is `4b07d350fab331b4ab3fb3c997e9f135e8fdf3bf6964f94f460deb14bd49fefb`. These are partial observations, not full successful snapshot digests. All six retained metadata/count/page byte lengths and checksums matched their failure descriptors on reconstruction. Both pages are byte-identical; partial IDs only in A/B are 0/0. No pagination-boundary or whole-source absence/completeness claim follows from one page.

Strict reconstruction of each page reproduced `Source number loses decimal precision in binary64 serialization`. Diagnostic token inspection found ten incompatible coordinate tokens in the shared page, including `-122.37952207229336` (JavaScript serializes it as `-122.37952207229335`) and `37.732536608656226` (serializes as `37.732536608656225`). The diagnostic parser was used only to inspect tokens and count textual IDs; rounded coordinate payloads were not accepted or hashed as canonical data. No successful feature, dataset or identity/geometry digest was produced. Whole-source ID differences and same-ID content/geometry change counts are unverified, not zero. This demonstrates the strict input profile rejecting real source decimals, not nondeterministic source behavior or an observed dataset edit.

Local review evidence is retained under `%TEMP%/curb-live-double-98011c373090428db5ef2a2cb6ce7dc2/`: A in `capture-1/`, B in `independent-b/capture-1/`, and `failure-comparison.json` with the detailed partial observations. `%TEMP%/curb-live-diagnostics-cn242d/` contains bounded endpoint, redirect and precision diagnostics. Raw response bodies total about 0.8 MB across both attempts. Nothing was uploaded or added to Git. No third capture ran.

Resolved: live ordered-query acceptance and metadata/count access on the current public hostname. **Double-capture validation remains unresolved.** The precision incompatibility requires an explicit lossless numeric/canonicalization decision and version/compatibility review; silently rounding coordinates or weakening `curb-jcs-v1` is not a fix. Future database compatibility must also address migration 00012's existing pins to `https://data.sfgov.org/resource` and the old manifest endpoint; this milestone did not edit or apply migration SQL. Durable immutable artifact retention, independent verifier authentication and real source registration remain production blockers. No transaction isolation, association approval, physical-curb continuity, coverage readiness or runtime switch follows from these partial captures.
