# City curb lossless database ingestion boundary V1

## Current: V2 ingest eligibility and staging RPC V1

**DB INGEST ELIGIBILITY RESOLVED for the defined domain and the complete retained source. V2 STAGING RPC LOCALLY VERIFIED. PRODUCTION NOT APPLIED; V2 PUBLICATION BLOCKED.** Migration [00013](../supabase/migrations/00013_city_parking_curb_staging_rpc.sql) is a forward migration; 00012 and the lossless capture codec are unchanged. Only synthetic fixtures were staged in fresh disposable PostgreSQL 17.6 clusters. The existing local Supabase database was untouched.

| State | Meaning in this milestone |
|---|---|
| Capture-valid V2 | Original JSON passes lossless parsing and V2 hashing. It can remain useful archived evidence even when storage-ineligible. |
| DB-ingest-eligible V2 | Capture-valid feature also passes the explicit numeric, string, geometry and size contract below. This is not a publication verdict. |
| STAGING | A server-only TEXT call has atomically inserted/reused an immutable version and snapshot membership. Supplied hashes are not independently proven. |
| Verification | An independently authenticated verifier must replay retained artifacts and compare the full DB member set, payloads and hashes. A V2 implementation/attestation review remains outstanding. |
| Publication | Requires validated, sealed evidence and guarded pointer advancement. The unchanged V1 completeness gate rejects V2 manifests, so this task cannot publish V2. |

The capture manifest's pre-existing `summary.locally_eligible` describes its capture/geometry checks, **not** this new database eligibility contract. It was not reinterpreted or rewritten.

### Deterministic eligibility contract

[`curb-db-eligibility.ts`](../scripts/curb-db-eligibility.ts) exposes `curbDbEligibility(losslessParsedFeature, version)` and the contract tag `curb-db-eligibility-v1`. It returns `ELIGIBLE` or `INELIGIBLE`, explicit reasons and a PostgreSQL-text byte estimate. No score, DB dependency, rounding, repair or numeric Number conversion is involved. String/BigInt arithmetic decides decimal range and expansion; JS numbers are used only for bounded lengths/counts.

- Require capture-valid `curb-decimal-v2`, including valid nonblank/non-placeholder external `globalid`. Native source Numbers fail closed. The capture parser's existing 4,096 significant-digit, 8,192 token-character, depth-100 and broader exponent bounds remain unchanged.
- Require a nonzero `LineString` with at least two exactly two-dimensional numeric positions and exact longitude/latitude bounds. Unknown geometry members and attributes are retained and recursively checked.
- Each normalized decimal must fit PostgreSQL's 131,072 integer-digit / 16,383 fractional-digit range **and** its signed, expanded plain decimal token must fit 8,192 characters for lossless readback. Canonical token length must also fit 8,192. Sign and `0.` count toward the expanded limit. Thus positive `1e8191` and `1e-8190` are eligible; their negative equivalents have one fewer available digit. `1e8192`, `-1e8191`, `1e-8191` and `-1e-8190` are ineligible. No arbitrary smaller exponent cap replaces the exact expansion calculation.
- Reject NUL in any string or object key because JSONB cannot store it. Numeric-looking strings remain strings and are not subjected to numeric rules.
- Limit both canonical feature UTF-8 input and expanded PostgreSQL JSONB text to **1,048,576 bytes per feature**. The pure estimator includes JSONB separator spaces and numeric expansion without constructing giant numbers. SQL checks actual byte lengths. The current largest feature uses 41,083 bytes. The narrower per-feature storage budget does not alter the 32 MiB capture-body contract.

Reasons are `{path, code}` with RFC 6901 JSON Pointer paths, root `""`. Version/invalid-capture/geometry checks precede a deterministic traversal (UTF-16 sorted object keys, array order). All applicable numeric reasons are emitted; out-of-range precedes too-long at the same path. Unknown fields and nested arrays are traversed. Reason codes:

| Code | Meaning |
|---|---|
| `INVALID_CAPTURE_VALUE` | Not a valid V2 source feature; includes native Number or invalid identity. |
| `UNSUPPORTED_CANONICALIZATION_VERSION` | Anything except `curb-decimal-v2`. |
| `INVALID_FEATURE_SHAPE` | Missing/null, wrong type, dimensionality, range, or zero-length geometry. |
| `NUMERIC_OUT_OF_POSTGRES_RANGE` | Exact normalized decimal exceeds PostgreSQL range. |
| `NUMERIC_TOKEN_TOO_LONG` | Canonical or expanded signed token exceeds 8,192 characters. |
| `POSTGRES_UNSUPPORTED_STRING` | NUL in a key/string. |
| `DOCUMENT_TOO_LARGE` | Canonical input or expanded JSONB text exceeds the storage byte budget. |

### Complete retained source profile

Offline archive reconstruction and eligibility profiling used `%TEMP%/curb-v2-double-02753736130e4c279273764268ef070d/a/capture-1`. Raw files/manifest checksums and the full logical dataset were verified first. No refetch or source-data staging occurred.

| Observation | Result |
|---|---|
| Total / eligible / ineligible rows | **18,355 / 18,355 / 0** |
| Rejection reasons | None |
| Numeric values inspected | 238,162 |
| Longest source / canonical / expanded numeric token | 19 / 19 / 19 characters |
| Explicit positive / negative exponent forms | None / none |
| Normalized scientific exponents | Minimum 1, maximum 2 |
| Largest absolute numeric value | `122.51112275175241` |
| Largest integral numeric value | None: all actual JSON numbers in this retained capture are fractional. Numeric strings were not coerced. |
| Maximum integer-part digits | 3 |
| Maximum significant / fractional digits | 17 / 15 |
| Largest expanded JSONB feature | 41,083 UTF-8 bytes |
| Dataset SHA-256 | `f536717d946b36d19bfcb9ae2d7ca0e753fe09e4e08e3bde1356ad0c6c5216a2` |

These are observations of the retained source state, not guarantees about future captures. Every future capture must be checked independently; ineligible rows must not be silently filtered into an allegedly complete publication.

### Implemented migration and RPCs

00013 broadens the two canonicalization CHECKs to recognize V1 and V2, while requiring V2 snapshots to carry the V2 format/version/provider/dataset/source-key/current-endpoint envelope. `lock_source` explicitly accepts legacy/current DataSF endpoints for historical compatibility; V2 staging additionally requires the current endpoint. No source row or existing evidence is updated. V1 validation/publication functions, immutability guards, RLS and membership seal are unchanged. The V2 format constraint prevents disguising V2 as a V1 manifest to bypass the outstanding V2 attestation work.

Implemented signature:

```sql
public.stage_city_parking_curb_version(
  p_source_id uuid, p_snapshot_id uuid, p_external_id text,
  p_canonical_feature_json text, p_geometry_sha256 text,
  p_attributes_sha256 text, p_content_sha256 text,
  p_canonicalization_version text
) RETURNS uuid
```

Only `service_role` can execute staging. Both staging and authoritative read use `SECURITY DEFINER`, migration-executor ownership (normal NOSUPERUSER `postgres`) and fixed `pg_catalog, pg_temp` search paths with qualified application objects. This follows 00012's ownership contract rather than introducing an untested owner/membership scheme. DEFINER is necessary because direct service INSERT on versions/membership is revoked; service cannot bypass eligibility by writing those tables. Service snapshot INSERT remains available. PUBLIC/anon/authenticated execution is revoked transactionally; verifier cannot stage. Administrative schema owners remain outside the immutability threat model.

The function rejects unsupported version, invalid identity/hash format, null/oversized input, malformed JSON and unsupported JSONB numerics/Unicode. It parses TEXT server-side and uses PostgreSQL's built-in `IS JSON OBJECT WITH UNIQUE KEYS` to reject duplicate decoded keys, including nested keys. A small recursive JSONB walker enforces depth 100, expanded numeric tokens 8,192 and significant digits 4,096; actual JSONB text must fit 1 MiB. This is not a SQL numeric parser/canonicalizer. `payload::jsonb` alone is insufficient because PostgreSQL accepts larger values than the readback domain. Syntax/range/string errors abort the whole RPC before any durable change; subsequent rejection also rolls back all writes.

After structural checks, source-first locking enforces READ COMMITTED and exact registry identity/current endpoint. The snapshot must exist under that source, be STAGING and match V2. Source `globalid` must equal the supplied external ID. The existing exact SQL-numeric LineString validator determines geometry eligibility. The function splits shape/raw attributes, derives geometry state/presence/reasons, and relies on generated UUID/timestamp defaults.

Version reuse uses the actual `(source_id, external_id, canonicalization_version, content_sha256)` unique key. A reuse must also match complete JSONB geometry/raw attributes and supplied geometry/attribute hashes. Same identity/content returns the existing UUID; changed content creates a new version; different external IDs cannot merge even with the same claimed hash. Same snapshot/external-ID/version is a no-op, including concurrent retries. A different version for existing membership rejects, with no orphan version committed. No immutable row is updated.

`public.read_city_parking_curb_version(p_curb_version_id uuid)` returns `id`, `source_id`, `external_id`, `canonicalization_version`, `geometry_presence`, `geometry_json_text`, `raw_source_json_text`, and the three hash TEXT fields. Only service/verifier roles execute it. Reconstruct the feature using lossless parses of the two TEXT documents; ordinary SDK JSONB-object reads remain unsuitable for authoritative verification.

**Hash trust is unchanged:** hash-format, identity and immutable-reuse consistency checks do not independently prove the supplied V2 hashes. The harness deliberately stages a different external ID with the same claimed content hash to prove non-merging, not hash authenticity. Independent replay must catch dishonest/stale claims before publication. No complete SQL V2 canonicalizer was added. The RPC expects canonical text from the trusted producer but does not independently prove its key order or canonical spelling.

### Local execution evidence and commands

```powershell
pnpm.cmd exec tsx scripts/verify-curb-db-eligibility.ts
pnpm.cmd exec tsx scripts/verify-curb-db-eligibility.ts --archive=<retained-capture-directory>
pnpm.cmd exec tsx scripts/verify-curb-staging-rpc.ts --local-disposable
```

The pure verifier passed **33** deterministic checks and the complete retained-source scan above. The fresh RPC harness passed **71** checks, including concurrent retries, exact boundary values, complete rollback on rejection, hash/text readback, malformed/duplicate-key JSON, precise geometry bounds, immutable reuse conflicts, role ACLs, direct-INSERT denial and publication barriers.

The harness uses cached `public.ecr.aws/supabase/postgres:17.6.1.167` and PostgREST v16.2, actual installed Supabase JS, Docker Desktop's local pipe and an internal private DB network. PostgreSQL has no published port. PostgREST has only a `127.0.0.1` host binding and a second connection to the private DB network; the SDK transport refuses other origins/redirects and only strips the gateway prefix. The fresh test cluster has minimal Supabase role/bootstrap prerequisites; it is not a full Supabase Auth/Realtime stack. It applies the actual 00001 updated-at helper and complete 00005, 00012 and 00013 files as NOSUPERUSER `postgres`. It does not reset/start the existing local project or apply unrelated migrations/extensions. This is a real dependency-closure compile/behavior test, not a replacement curb schema.

All three migration files compiled on the first SQL application attempt. Initial harness infrastructure attempts exposed Docker internal-network port publishing and private-connection setup issues; these were fixed in the harness, and each retry used a new cluster. There was no PostgreSQL migration defect to patch/retry in place. The harness stops on the first migration error, cleans its containers/volumes/network in `finally`, and every invocation starts fresh. Forced process/host termination can prevent cleanup; generated `curb-staging-*` names identify only disposable test resources. No production credentials or `.env` are loaded. Per-run JWT material is not printed or committed.

Numeric limits were re-tested on actual PostgreSQL 17.6: `1e131071` and `1e-16383` are accepted with text lengths 131,072 and 16,385; `1e131072` and `1e-16384` reject with `22003`. The wider accepted PostgreSQL boundary values are rejected by the RPC's narrower token rule. Exactly 4,096 significant digits stage and hash-reconstruct; 4,097 are explicitly rejected by SQL. Signed positive/negative expansion boundaries were tested on both sides. Inputs remained bounded (largest numeric expansion approximately 131 KiB).

Required regression checks: typecheck; canonicalization 100 V2 + 34 V1; publication contract 41; interval 38; eligibility 33 plus 18,355-row profile; staging RPC 71; `git diff --check`. Production rollout still requires review/application of the forward migration, durable immutable artifact retention, source registration/endpoint rollout decisions, an independently authenticated V2 artifact verifier and V2 validation/publication compatibility tests. No production connection or writes, production ingestion, PostGIS, runtime, legality, coverage, UI, AI, agent or MCP changes. CITY remains INCOMPLETE.

## Original TEXT-boundary milestone (historical)

The remaining sections preserve the preceding 44-check transport proof and its original proposed interface. Statements below describing RPC implementation/eligibility as future work are superseded by the current section above; production remains disabled.

**LOSSLESS CAPTURE VERIFIED. LOSSLESS DB TEXT BOUNDARY VERIFIED for tested source values and the bounded domain below. ORDINARY JS OBJECT PATH UNSAFE. PRODUCTION INGESTION NOT YET ENABLED.**

Local execution: PostgreSQL **17.6**, cached PostgREST **v16.2**, installed Supabase/PostgREST JS **2.105.4**. The repeatable verifier passed **44 checks**. It created only a disposable schema, receipt table, four functions, two roles and one loopback-published PostgREST container; all were removed. It did not modify existing curb rows, apply migrations, fetch DataSF, or contact any hosted database. CITY remains **INCOMPLETE**.

## Actual storage and client behavior

Migration `00012_city_parking_curb_storage.sql` defines these curb-version columns:

| Purpose | Actual columns / types |
|---|---|
| Internal/source identity | `id uuid` generated by default; `source_id uuid` registry FK; `external_id text COLLATE "C"` |
| Geometry | `geometry_presence text` distinguishes ABSENT/NULL/VALUE; `geometry_geojson jsonb` holds the entire shape for VALUE |
| Attributes | `raw_source jsonb NOT NULL`, an object without `shape`; its string `globalid` must equal `external_id` |
| Hashes | `geometry_sha256`, **`attributes_sha256`** (plural), `content_sha256`: `curb_private.sha256_hex` |
| Versions/validation | `canonicalization_version text`; `geometry_state text`; `validation_version text`; `validation_reasons jsonb` array |
| Immutable reuse identity | UNIQUE `(source_id, external_id, canonicalization_version, content_sha256)` |

Snapshot `manifest` is also JSONB. Membership binds `(snapshot_id, source_id, external_id, curb_version_id)` through composite FKs. Publication has a separate source pointer. There is no canonical-source-TEXT column in 00012.

The installed `node_modules/@supabase/postgrest-js/src/PostgrestBuilder.ts` serializes request bodies at line 320 with `JSON.stringify`, converting BigInt to **strings**. At line 479 it parses ordinary responses with `JSON.parse`. `LosslessJsonNumber.toJSON()` throws on this request path; the class also forbids implicit numeric coercion. Replacing wrappers with Number silently rounds; replacing them with strings changes source JSON types.

Observed local failures: both `-122.37952207229336` and `-122.37952207229335` become the same Number; ordinary serialization sends the latter. `9007199254740993` becomes `9007199254740992`. The verifier confirms actual ordinary-object RPC precision loss, actual wrapper rejection by the installed client, and loss in an ordinary JSONB response even when the stored number was exact.

## Safe wire and read boundaries

Write one **string** RPC argument: `canonical_feature_json = canonicalJson(parseSourceJson(originalBytes))`. The outer request is ordinary JSON, but every authoritative numeric token is inside this string. PostgreSQL receives `text` and performs `canonical_feature_json::jsonb`; no JS Number or PostgreSQL floating cast intervenes. Do not first run `JSON.parse` on the feature or use `response.json()` on source bytes.

The disposable `ingest(payload text)` function stores both the received text and parsed JSONB. Each successful test compares the received string byte-for-byte with its argument. A separate read RPC returns `document::text`, `(document->'shape')::text`, and `(document-'shape')::text`. Supabase's outer response parse produces strings; the inner documents are reparsed using `parseSourceJson`. SQL NULL for absent shape and JSON text `null` are distinct. Complete-feature and split-column reconstruction both reproduce geometry, attributes and content hashes.

JSONB key order and numeric spelling need not equal the input bytes. Semantic V2 canonical values and hashes must agree. PostgreSQL `jsonb::text` is **not** V2 canonical JSON; run the lossless canonicalizer after reading it. Authoritative reads should return hashes/identity plus JSON **text** and geometry presence. Ordinary JSONB object reads are acceptable only for explicitly approximate display/math, never re-verification or future authoritative writes.

## Numeric proof and limits

All eight recorded real regression tokens passed exact source-token -> lossless wrapper -> canonical text -> real Supabase RPC -> JSONB -> extracted text -> lossless reparse:

```text
-122.37952207229336    37.732536608656226
37.743691137180925     -122.43840032071572
-122.45281351125684    37.711929941578966
-122.40468496538819    37.768428921166255
```

The neighbor `-122.37952207229335` remained distinct. A direct PostgreSQL `SELECT ('{"x":-122.37952207229336}'::jsonb->>'x')` returned exactly that text. Positive/negative `9007199254740993`, `0.10000000000000001`, a 30-digit integer with a 19-digit fraction, `1e-400`, `1e400`, exponent spelling variants and canonical negative zero passed. V2 sends all zero spellings as `0`. Five synthetic complete features embed observed coordinates and nested precise attributes, Unicode, numeric strings, null/absent geometry and arrays; all **15 authoritative hashes** matched after persisted readback.

Locally established PostgreSQL limits: `1e131071` succeeds (131,072 integer digits); `1e131072` rejects with SQLSTATE `22003`. `1e-16383` succeeds; `1e-16384` rejects with `22003`. Malformed JSON rejects with `22P02`; `\u0000` rejects with `22P05`. These failed calls leave no receipt row. A TEXT argument does **not** make every V2 input JSONB-compatible.

There is a separate read-boundary limit: V2 limits each original numeric token to **8,192 characters**, significant digits to 4,096 and decimal exponents to +/-1,000,000. JSONB expands exponent values to plain decimal. `1e8191` and `1e-8190` round-trip through the current parser; `1e8192` and `1e-8191` store exactly but their expanded readback is rejected by that parser. PostgreSQL's maximum examples also exceed the parser limit. No rounding, limit weakening or silent truncation was added.

Before production, define a **fail-closed storage eligibility gate**: every JSONB numeric leaf's plain textual representation must fit the current parser's 8,192-character limit, and the reconstructed document must fit its 32 MiB/depth bounds. Check canonical source eligibility offline and enforce readback bounds transactionally before inserts commit; PostgreSQL must reject its own unsupported numeric/string inputs. Include these gates in the independent verifier. This is narrower than V2 capture acceptance, and does not change what can be retained in raw artifacts. A broader-domain TEXT retention/read contract would require separate design. The successful source fixtures do not prove eligibility of every field in all 18,355 captured rows; a full retained-artifact eligibility scan is a rollout prerequisite.

## Proposed production architecture (design only)

Retained immutable artifact -> lossless V2 parser and eligibility checks -> complete canonical feature TEXT plus hashes -> narrowly authorized staging RPC -> server JSONB parse and structural checks -> immutable version plus snapshot membership. Independent artifact replay must attest the complete frozen snapshot before publication. Retain the original raw bytes outside JSONB for original numeric spellings and evidence.

Proposed exact signature, **not created or executable as shown**:

```sql
public.stage_city_parking_curb_version(
  p_source_id uuid,
  p_snapshot_id uuid,
  p_external_id text,
  p_canonical_feature_json text,
  p_geometry_sha256 text,
  p_attributes_sha256 text,
  p_content_sha256 text,
  p_canonicalization_version text
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
```

The function must implement all of the following before it can ship:

1. Use a dedicated, minimally privileged server owner and fully qualified object names. Revoke default PUBLIC execution in the same transaction as creation. Revoke anon/authenticated execution; grant only the server ingestion role (initially `service_role`). Grant no client schema/table rights through this interface. Review existing direct INSERT grants to prevent bypassing the new checks.
2. Match 00012's READ COMMITTED/source-first locking order: lock the registry source, verify `datasf_citywide_curbs` / `DATASF` / `pep9-66vw` and the reviewed current endpoint; then lock the matching snapshot. Require the same source, `STAGING`, `curb-decimal-v2`, and the reviewed V2 manifest contract. Do not weaken publication/attestation/immutability guards.
3. Require non-null bounded TEXT, matching nonblank string `globalid`, correct supplied external identity/version and all three lowercase 64-hex hash fields. Parse TEXT on the server; reject malformed JSON, JSONB-ineligible values and readback-range violations. A normal JS object supplied to the TEXT parameter is not an accepted authoritative encoding; the trusted caller must supply V2 canonical text. PostgreSQL JSONB parsing alone does not detect duplicate source keys or prove canonical spelling; strict artifact parsing and independent replay remain necessary.
4. For this first eligible staging interface, require `shape` to be an object with type `LineString`, at least two exactly two-dimensional numeric positions, longitude/latitude bounds checked as SQL numeric, and a nonzero segment. Reject other/missing/null geometry rather than repairing it or publishing an incomplete filtered capture. Derive `geometry_presence='VALUE'`, `geometry_geojson=feature->'shape'`, `raw_source=feature-'shape'`, `geometry_state='USABLE'`, the reviewed geometry-validation version and empty reasons. The underlying storage still supports quarantined missing/malformed shapes; the disposable precision test deliberately covers null/absent hash semantics as well.
5. Supply no UUID or timestamp overrides. Insert/reuse on the actual immutable unique key; on conflict, verify stored geometry, attributes and all supplied hashes match, otherwise reject. Never overwrite content. Add/reuse membership with matching composite identity; a conflicting version for an existing snapshot external ID rejects. Return the version UUID. Version and membership writes must be atomic.

Future execute privileges, after the reviewed implementation exists:

```sql
REVOKE ALL ON FUNCTION public.stage_city_parking_curb_version(
  uuid, uuid, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_city_parking_curb_version(
  uuid, uuid, text, text, text, text, text, text
) TO service_role;
```

Recommended authoritative read signature: `public.read_city_parking_curb_version(p_curb_version_id uuid)` returning `id uuid, source_id uuid, external_id text, canonicalization_version text, geometry_presence text, geometry_json_text text, raw_source_json_text text, geometry_sha256 text, attributes_sha256 text, content_sha256 text`. Return JSONB casts to TEXT, restrict execution to server/verifier roles, and reconstruct absent/null/value geometry explicitly. Client canonicalization supplies canonical spelling; SQL does not claim to do so.

## Hash trust and migration compatibility

Do **not** hash `jsonb::text` and call it a V2 digest: ordering, numeric spelling and hash-domain envelopes differ. The trusted offline canonicalizer supplies hashes; the DB validates their format, identity, structure, immutable reuse consistency and membership binding. This does not independently prove supplied hashes. The separately authenticated artifact verifier must replay retained bytes, read authoritative DB TEXT losslessly, recompute all V2 hashes, compare the complete member set and seal it before validation/publication. It must not trust the ingest caller's claim. This avoids an independently maintained complete SQL copy of the TypeScript canonicalizer.

00012's JSONB/text/hash column **types** and numeric geometry checks are suitable within the documented domain. However, 00012 is **not V2-compatible unchanged**: snapshot and version CHECKs pin `curb-jcs-v1`; completeness guards pin `curb-snapshot-v1`; source and manifest endpoints pin `data.sfgov.org`. No edits to migration history were made and no migration was applied. A separately reviewed forward compatibility migration and lifecycle/security execution tests are required before staging V2. The disposable proof intentionally does not bypass these guards or insert V2 into actual curb tables.

Remaining production blockers: that forward compatibility work; production staging/read RPC implementation and privilege review; explicit numeric/size eligibility with full retained-artifact validation; authenticated independent verifier and V2 attestation compatibility; durable immutable artifact retention; reviewed source registration and production rollout. This milestone resolves the precision-safe **transport/storage mechanism**, not production readiness or the full V2 value domain.

## Repeatable local verification

```powershell
pnpm.cmd exec tsx scripts/verify-curb-lossless-db.ts --database-url=postgresql://postgres@127.0.0.1:54322/postgres
# Equivalent package entry: pnpm.cmd verify:curb-lossless-db --database-url=postgresql://postgres@127.0.0.1:54322/postgres
```

Prerequisites: existing `supabase_db_smart-parking` container on Docker Desktop's local Linux engine pipe, port 54322, `supabase_network_smart-parking`, and cached `public.ecr.aws/supabase/postgrest:v16.2`. The verifier refuses alternate/hosted endpoints and the production ref before Docker; it never loads `.env`, uses Supabase CLI start/reset, pulls images or applies SQL migration files. It uses local admin psql only to provision/remove its random test objects. Existing curb tables and source registrations are untouched.

PostgREST connects with a random temporary login role and exposes only the random test schema. Its host port binds to `127.0.0.1`. Per-run test password/JWT material stays in memory/local container configuration and is not printed or committed. The SDK fetch adapter checks the exact loopback origin, refuses redirects and removes only the `/rest/v1` gateway prefix; request/response bodies go unchanged through actual HTTP/PostgREST/PostgreSQL. No mocked RPC result is used. The test executor can execute the disposable functions but has no direct receipt-table privileges. anon/authenticated calls are rejected.

Cleanup runs in `finally` on success and ordinary failures, removes the exact named test container/schema/roles, and checks their catalog absence. Cleanup failure makes verification fail. As with any process, forced termination/host failure can prevent `finally`; the emitted random schema suffix identifies only that run's disposable objects for local cleanup. No resets or deletion of existing curb history are part of the procedure.

Required checks passed: `pnpm.cmd typecheck`; canonicalization **100 V2 + 34 V1**; publication contract **41**; interval **38**; local boundary **44**; `git diff --check`. No production access, production writes, ingestion, migration apply, PostGIS enablement, runtime, legality, coverage, AI, agent, MCP or UI changes. No secrets printed and no commit created.
