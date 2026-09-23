# City Curb Snapshot + Canonicalization Contract V2

**CURRENT: LIVE ORDERED QUERY VERIFIED; LOSSLESS V2 SINGLE CAPTURE VERIFIED; LOSSLESS V2 DOUBLE CAPTURE VERIFIED; PRODUCTION PUBLICATION BLOCKED.** The [V2 contract](#11-lossless-numeric-v2-current-contract) and [independent double-capture evidence](#12-live-double-capture-validation-v2) supersede earlier numeric/capture blocker statements, which remain historical evidence. Two fresh captures on 2026-09-22 each completed with 18,355 unique rows, 19 pages, zero retries and CONSISTENT status. All IDs, per-feature hashes, logical digests and raw page bytes matched; offline reconstruction passed for both. No database was contacted. Canonicalization remains `curb-decimal-v2`; V1 remains separately reproducible.

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

## 11. Lossless numeric V2: current contract

### Precision path and parser

The original shared GET helper invoked `response.json()`, converting source numeric lexemes to binary64. Capture separately retained bytes and reparsed them; V1's `parseSourceJson` then called `Number(token)` and compared the decimal value with `JSON.stringify(number)`, correctly rejecting losses such as `-122.37952207229336` becoming `-122.37952207229335`. The capture also compared that strict parse with the already-rounded helper result. Merely removing the guard would silently corrupt source identity.

V2 uses the existing structural JSON parser with a different number representation. `fetchDataSfJson` has an optional `readBody` hook; capture requests original decoded UTF-8 bytes instead of `response.json()`. Existing callers retain the default JSON behavior and retry policy. Bytes are retained/checksummed before strict parsing. Only JSON string literals use `JSON.parse`; source numbers never do. Path:

```text
HTTP decoded body bytes -> retained artifact + SHA-256
  -> structural JSON parser -> LosslessJsonNumber for EVERY numeric token
  -> exact geometry and attribute envelopes -> canonical decimal JSON
  -> geometry/attribute hashes -> versioned content hash -> sorted dataset hash
```

Duplicate decoded keys, invalid grammar/UTF-8/BOM, unpaired surrogates, excessive depth and non-JSON values still reject. Arrays preserve order; absent fields and null remain distinct; unknown fields remain authoritative. A numeric token becomes an immutable class instance with private normalized sign, coefficient digits and BigInt decimal exponent. This is not a tagged source object or a quoted numeric string. Ordinary source objects cannot forge the private numeric state. `Symbol.toPrimitive` and `toJSON` throw, so coercion/arithmetic and ordinary `JSON.stringify` cannot silently approximate or serialize the wrapper incorrectly.

A narrow normalizer was selected over a new package: token normalization and comparison require only strings and bounded BigInt exponent arithmetic. No package/dependency change was needed. This is a custom exact-decimal contract using the established UTF-16 key sorting and string escaping, **not RFC 8785 binary64 numeric serialization**.

### Exact numeric normalization

Parse the JSON sign, integer digits, optional fractional digits and optional exponent without numeric conversion. Combine coefficient digits, remove leading zeros, subtract fraction length from the exponent, then remove trailing coefficient zeros while incrementing the exponent. All zero spellings become unsigned `0`.

For a nonzero coefficient of length `L` and exponent `scale`, let `order = L - 1 + scale`. For `-6 <= order <= 20`, emit ordinary decimal notation with no redundant zeros. Otherwise emit one leading digit, an optional fractional suffix, lowercase `e`, and the signed exponent with no leading zeros or `+`. All output tokens remain JSON **numbers**, not strings. Large exponent values are never expanded into huge strings. Conversion of a bounded string-placement index to Number is not conversion of a source decimal value.

| Input spellings | Canonical numeric output |
|---|---|
| `1`, `1.0`, `1.00`, `1e0`, `1E+0` | `1` |
| `0.10`, `0.100` | `0.1` |
| `0`, `-0`, `-0.0` | `0` |
| `123`, `1.23e2`, `1.2300e+2` | `123` |
| `9007199254740993` | `9007199254740993` |
| `-122.37952207229336` | `-122.37952207229336` |
| `1e-400`, `1e400` | unchanged exact numeric values |
| `1e21` | `1e21` (no plus sign) |

Bounds: 32 MiB per parsed body, depth 100, 8,192 characters per numeric token, 4,096 normalized significant digits, and both written and normalized scientific exponent magnitudes at most 1,000,000. Exceeding a bound rejects; there is no truncation or rounding. Canonical output fits these parsing limits, including the maximum-significance regression case. This accepts arbitrary decimal precision within explicit resource bounds, not unlimited input.

All geometry coordinates and numeric attributes use this path. `canonicalFeature` rejects every native JS number, including safe-looking integers that might already have been rounded from a precise fraction. The generic serializer permits native safe integers only for tooling-generated counters, lengths and statuses. Manifest reconstruction first parses losslessly, then explicitly checks that control-number conversions are exact safe integers. Count API strings are similarly validated before conversion. Source geometry/attributes never use these control conversions.

### Geometry and diagnostic math

Geometry hashes preserve exact numeric values, vertex order, direction and every geometry member. Reversal, a final decimal-digit edit, added/removed vertices and unknown-member changes remain visible. Numeric/string distinctions also apply to all attributes, including large integers, fractions and exponents.

The supported-LineString gate uses exact decimal comparisons for longitude/latitude limits and canonical equality for nonzero segments. It does not round near-boundary coordinates into range. `toDiagnosticNumber` is the separately named, explicitly approximate boundary for optional spatial math; overflow/underflow reject and the immutable source wrapper is unchanged. Its output must never feed snapshot/hash/storage payloads. Existing V1 interval math and the local V1 database fixture harness now explicitly import the preserved V1 codec; their behavior/contracts were not switched to V2.

### Version and digest compatibility

New captures declare `canonicalization_version=curb-decimal-v2`, `format_version=curb-snapshot-v2` and `fetch_tool_version=curb-capture-v2`. This avoids falsely labeling exact-decimal behavior as JCS V1. Every logical hash domain changes from `city-curb/<domain>/v1\n` to `city-curb/<domain>/v2\n`, including geometry, attributes, content, dataset, identity-geometry, external IDs, metadata, schema, raw-page envelope and tool-source envelope. Envelope structures remain as documented above, with the new canonicalization version where present. Bare SHA-256 checksums of raw bytes remain ordinary SHA-256 and are not versioned. Manifest checksum hashes its exact V2 bytes.

V1 and V2 digests are not interchangeable, even for inputs with unchanged numeric spelling. `canonicalize-curb-snapshot-v1.ts` is byte-identical to the pre-change implementation; its original precision guard remains. The 34-check legacy suite and archive replay remain available. Archive verification selects the codec by explicit supported version and rejects unknown versions or mismatched format/version pairs. V1 archives retain both previously supported public hostnames. Production has no published curb snapshot per the supplied baseline; no database verification was performed here. Synthetic V1 database history remains V1 and is not relabeled or migrated.

### Future database and client precision boundary (review only)

PostgreSQL JSONB maps JSON numbers to exact `numeric` values within its limits, but does not retain original byte spelling or object order. Out-of-range numeric values and `\u0000` are additional JSONB restrictions. Raw artifacts remain necessary. [PostgreSQL JSON documentation](https://www.postgresql.org/docs/current/datatype-json.html)

Unconstrained PostgreSQL numeric supports up to 131,072 digits before and 16,383 after the decimal point. V2's capture exponent bound is deliberately broader, so capture acceptance alone cannot guarantee JSONB eligibility; future ingestion must reject unsupported ranges instead of coercing to a scaled or floating type. [PostgreSQL 17 numeric limits](https://www.postgresql.org/docs/17/datatype-numeric.html)

Inspected local `@supabase/postgrest-js` 2.105.4: `src/PostgrestBuilder.ts` serializes request bodies with `JSON.stringify` (BigInt values become strings) and parses ordinary JSON responses with `JSON.parse`. Converting our wrapper to Number would lose precision; converting it or a BigInt to a quoted string changes the JSON numeric type. Our wrapper intentionally throws under that ordinary object-serialization path. Fetching JSONB through ordinary parsed JSON would also reintroduce Number on the return path.

Recommended future boundary: submit the complete V2 canonical JSON **text** as a string parameter to a narrowly authorized text-accepting RPC; parse that text as JSONB/numeric inside PostgreSQL after contract/type/range validation. Outer client serialization escapes the string but preserves its inner numeric tokens. Return authoritative payloads as text and reparse losslessly for hash verification. Do not deserialize/re-serialize source payloads through normal JS objects or `Number`; do not store numeric coordinates as JSON strings. This is a design recommendation only, with no RPC/ingestion implementation or database execution here.

Migration 00012 already stores geometry/raw source as JSONB and its geometry gate uses SQL numeric. However, its version, manifest-format/query and old-host source/endpoint guards still target V1. Those need separately reviewed compatibility work and execution tests before V2 storage/publication. The migration was not modified or applied; no existing local guard was weakened to accommodate V2.

### Offline and single live verification

`pnpm.cmd exec tsx scripts/verify-curb-canonicalization.ts`: **100 V2 checks plus 34 preserved V1 checks passed**. Coverage includes the real failing DataSF decimals, neighboring binary64 values, equivalent spellings, negative zero, large/tiny values, exponent/token limits, exact geometry bounds, source-type rejection, duplicate keys/Unicode, row/key order, numeric attributes, byte-fetch bypass, corruption detection and feature/geometry/dataset reconstruction. Typecheck passed; retry regression passed 40 cases; interval regression passed 38 checks; migration static verification passed 41 checks. No database verifier ran in this milestone.

Only after those offline tests, exactly one `--capture` invocation fetched public `data.sf.gov` dataset `pep9-66vw`. No double capture or second live attempt ran.

| Single live observation | Result |
|---|---|
| Started / finished UTC | 2026-09-22T21:33:55.856Z / 2026-09-22T21:34:11.658Z |
| Process exit / capture state | 0 / CONSISTENT |
| Source count before / after | 18,355 / 18,355 |
| Total / distinct IDs | 18,355 / 18,355 |
| Duplicate / missing / blank IDs | 0 / 0 / 0 |
| Pages | 19: eighteen 1,000-row pages, terminal 355-row page |
| Offsets / order | Exact 0..18,000 increments; strict global ID order across all boundaries |
| Geometry gate | All 18,355 usable; exact decimal comparisons |
| Retry events | 0 |
| Schema before / after | Equal |
| Metadata before / after | Equal |
| Retained artifacts | 23 bodies; 7,710,712 bytes; all length/checksum checks passed |
| Offline reconstruction | Passed: strict lossless pages, feature hashes, geometry/identity digest, dataset digest and manifest summary |

Exact successful V2 digests:

```text
dataset:           f536717d946b36d19bfcb9ae2d7ca0e753fe09e4e08e3bde1356ad0c6c5216a2
identity-geometry: 3051d88c0c71122a0945903c268a4db07431dc258d93aa575366fcc9e13202c6
external-ids:      c890e205fce1f986aba1a5e9c2a1b91180ebdac1b54bc8b0b6dbd95edbd8c5d9
schema:            3e0e6bc8f51f14a352bd58e898015149d3260d28fe8aea5584aad5ff533d9604
metadata:          fa9bce370f0123ffdcaeaf913cae36c8eb8cd7a738e44d40aa94a13c43b16210
raw-pages:         9148b1abf0ead2bd9aafebc128f430f766616a70355586539b9f6c218d73068c
manifest bytes:    ce2639f44d9dd014901f01fd80e998be89e81e13e68b00a51514d1dd9b76948f
```

Single-capture evidence: `%TEMP%/curb-decimal-v2-live-941a82c8b3544472bc1fa0d4d53dd259/capture-1/`; the parent contains `verification-report.json`. This milestone resolved numeric capture/hash compatibility; the subsequent double-capture milestone below verifies observed reproducibility. Artifacts remain outside Git and were not uploaded. CONSISTENT does not establish transactional isolation or CITY completeness. Production remains blocked by V2 database/client-boundary work, independent verifier authentication, source registration and durable immutable retention. No Supabase connection, database write, migration, ingestion, PostGIS or runtime/legality/coverage/UI/AI/agent/MCP change occurred.

## 12. Live double-capture validation V2

**LIVE ORDERED QUERY VERIFIED; LOSSLESS V2 SINGLE CAPTURE VERIFIED; LOSSLESS V2 DOUBLE CAPTURE VERIFIED; PRODUCTION PUBLICATION BLOCKED.** Exactly two new `--capture` processes independently fetched public `https://data.sf.gov/resource/pep9-66vw.json` with `$select=*`, `$order=globalid ASC`, `$limit=1000` and offsets increasing by 1000. Each confirmed its public hostname/dataset before fetching; only the Accept header was supplied, redirects were refused, and no credentials/environment files were loaded. Capture B used a new process and new files, with no application reuse of A's bytes or parsed features. A 15-second sleep followed A's successful process/reconstruction; process startup and reconstruction explain the additional gap between manifest capture timestamps.

| Observation | A | B |
|---|---|---|
| Start UTC | 2026-09-22T21:46:22.851Z | 2026-09-22T21:47:02.154Z |
| End UTC | 2026-09-22T21:46:40.025Z | 2026-09-22T21:47:21.243Z |
| Exit / consistency | 0 / CONSISTENT | 0 / CONSISTENT |
| Before / after source count | 18,355 / 18,355 | 18,355 / 18,355 |
| Rows / distinct IDs | 18,355 / 18,355 | 18,355 / 18,355 |
| Duplicate / missing / blank IDs | 0 / 0 / 0 | 0 / 0 / 0 |
| Pages / retries | 19 / 0 | 19 / 0 |
| Page sizes | 18 x 1,000; terminal 355 | 18 x 1,000; terminal 355 |
| Order / offsets / boundary repeats | Strict ascending / exact / none | Strict ascending / exact / none |
| Retained bodies / bytes | 23 / 7,710,712 | 23 / 7,710,712 |
| Offline reconstruction | PASS | PASS |

The same finalized tool-source digest was recorded by both runs. Canonicalization stayed `curb-decimal-v2` and format stayed `curb-snapshot-v2`; no code or contract change was necessary. A separate offline comparison explicitly disabled fetch, reconstructed both archives, checked every body checksum, rebuilt per-feature geometry/attribute/content maps and compared the whole row sets. Result: IDs only in A/B **0/0**; same-ID changed content **0**; changed geometry **0**; unchanged content **18,355**. All before/after metadata, schema and count observations agreed within and across captures. All nineteen corresponding raw page files were byte-identical, including pagination boundaries. No skipped IDs were detectable from counts, ordering or set comparison; this remains an observation rather than a transactional snapshot guarantee.

Both A and B have:

```text
dataset:           f536717d946b36d19bfcb9ae2d7ca0e753fe09e4e08e3bde1356ad0c6c5216a2
identity-geometry: 3051d88c0c71122a0945903c268a4db07431dc258d93aa575366fcc9e13202c6
external-ids:      c890e205fce1f986aba1a5e9c2a1b91180ebdac1b54bc8b0b6dbd95edbd8c5d9
schema:            3e0e6bc8f51f14a352bd58e898015149d3260d28fe8aea5584aad5ff533d9604
metadata:          fa9bce370f0123ffdcaeaf913cae36c8eb8cd7a738e44d40aa94a13c43b16210
raw-pages:         9148b1abf0ead2bd9aafebc128f430f766616a70355586539b9f6c218d73068c
feature-map bytes: 396f6fbb99c7cc0b0bbb06d1ce0aa785334bfe15fff1b451287ddbfc30298d3b
```

Manifest byte hashes differ as expected: A `f60ec7819866fbd4e894500714ebc84c567ea742ea8e6bef2a0f782a6bc3bee2`; B `f5ea80672ce08be07c5d625aee4a53692161d8c10e5a07c88ea553c152644691`. An exact manifest comparison found only capture start/end, per-artifact retrieval timestamps and HTTP Date headers changed. There is no observed source-content, metadata, schema or HTTP page-body serialization change and no unexplained hash divergence.

Local review root: `%TEMP%/curb-v2-double-02753736130e4c279273764268ef070d/`. Capture archives are `a/capture-1/` and `b/capture-1/`; independently reconstructed maps are `a/feature-digests.json` and `b/feature-digests.json`. `comparison.json` records complete metrics and `manifest-differences.json` records the exact differing paths. All evidence stays outside Git; no upload or third capture occurred. Reconstruction needs no future DataSF request.

**Live double-capture validation is RESOLVED for the observed source state.** Required checks passed: typecheck; 100 V2 plus 34 preserved V1 canonicalization checks; 41 publication static checks; 38 interval checks; `git diff --check`. Only the three status/contract documents changed in this continuation; pre-existing uncommitted implementation work was preserved. No database test or connection ran. Remaining production gates are a precision-safe database/client ingestion boundary and V2/endpoint compatibility, durable immutable artifact retention, independent verifier authentication, and source registration/production rollout procedure. Production project `pffznlpmgtrpsejayicj` was never contacted. No database writes, migrations, ingestion, PostGIS, runtime, legality, coverage, AI, agent, MCP or UI changes occurred. CITY remains INCOMPLETE.
