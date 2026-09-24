# City Curb Publication + Immutability Guards V1

**Current store/recovery follow-up:** [AWS S3 adapter and acceptance harness V1](./CITY_CURB_ARTIFACT_STORE.md) implements conditional writes, version-pinned recovery, bucket/object retention checks and separate uploader/read-only command paths. **S3 ADAPTER IMPLEMENTED; S3 MOCK-TESTED; AWS RESOURCES NOT PROVISIONED; NO CLOUD UPLOAD PERFORMED; CLOUD ACCEPTANCE PENDING.** Resource status describes this task, which did not inspect AWS. Uploader `RECOVERY_VERIFIED` still leaves cloud acceptance false; it is not independent verifier evidence or DB authorization. First execution permits only a fixed tiny synthetic archive. Separate verifier credentials, protected receipts, complete DB comparison, actual cloud retention/recovery acceptance and reviewed rollout remain required. The previous local 18,355-row replay remains valid; 00012/00014 and runtime are unchanged.

**Current artifact follow-up:** [Full archive verification and retention V1](./CITY_CURB_ARTIFACT_RETENTION.md) resolves complete offline V2 replay locally. It recomputes all 18,355 retained rows, checks eligibility and exports UUID-free membership inputs. Its archive-content seal is **not** the database membership seal: a separately authenticated process must still compare the entire staged DB TEXT payload/member set and derive actual version UUID bindings before 00014 attestation. Existing artifact/manifest URI and checksum fields suffice for the new versioned logical package contract; no migration changed. True durable retention, verifier provisioning/DB integration and reviewed production rollout remain blocked.

## Current: V2 validation and publication compatibility V1

**V2 VALIDATION/PUBLICATION COMPATIBILITY IMPLEMENTED AND TESTED LOCALLY; PRODUCTION NOT APPLIED.** Forward migration [00014](../supabase/migrations/00014_city_parking_curb_v2_publication.sql) adds immutable verifier evidence and a snapshot-bound membership seal. It preserves 00012/00013 files and the original V1 validation/publication implementations. Only synthetic local fixtures are used; the real 18,355-row capture is not staged or published. CITY remains INCOMPLETE.

The following V2 contract supersedes earlier statements that V2 is blocked by the V1 completeness gate. The original V1 SQL and evidence below remain historical contracts, not a claim that 00012 alone supports V2.

### Audit and compatibility matrix

| Existing feature | 00012/00013 finding | 00014 decision |
|---|---|---|
| Lifecycle, source locking, immutable versions/membership, pointer CAS | Already usable for V2 | Preserve source-first READ COMMITTED locking, freeze and predecessor rules. |
| Canonicalization | Actual V1 is **`curb-jcs-v1`**; 00013 also permits `curb-decimal-v2` | Reject `curb-decimal-v1`; it is not an alias or historical contract in this repository. |
| Manifest | 00012 completeness requires `curb-snapshot-v1`; 00013 permits V2 STAGING only | Add separate strict V2 completeness; never relabel V1 evidence. |
| Endpoint | V1 completeness pins legacy host; 00013 staging pins current host; source-identity trigger previously froze the registry URL | Keep exact capture URLs; allow only the reviewed one-way registry endpoint upgrade without changing logical identity. |
| Attestation | Snapshot stores verifier/time/version plus membership hash; V1 API binds manifest/seal only | Add immutable V2 evidence binding artifact/manifest/dataset/geometry/counts/eligibility/contracts. |
| Eligibility | No persisted explicit DB-eligibility outcome/counts | Require versioned ELIGIBLE result, eligible count = row count and ineligible count = 0 in attestation. |
| Membership seal | V1 hashes stable identity/hash tuples but not snapshot/source UUIDs in its header | Preserve V1; add V2 domain/header containing both UUIDs and contract versions. |
| Publication | V1 calls a completeness helper that examines geometry JSONB | V2 publication reads control metadata and sealed textual identities/digests only; numeric payload verification stays outside publication. |

| Canonicalization | Snapshot | New feature staging via 00013 | Validation | Publication | Required verifier / TEXT boundary |
|---|---|---|---|---|---|
| `curb-jcs-v1` | `curb-snapshot-v1` | No; historical V1 staged evidence remains supported | Original V1 path | Original V1 path | Independent `curb-artifact-verify-v1`; original V1 numeric contract preserved |
| `curb-decimal-v2` | `curb-snapshot-v2` | Yes, subject to DB eligibility | Atomic V2 attestation/validation | Yes, after bound V2 attestation | Independent `curb-artifact-verify-v2`; authoritative feature writes/reads use TEXT |
| `curb-jcs-v1` | `curb-snapshot-v2` | No | Reject | Reject | No cross-version reinterpretation |
| `curb-decimal-v2` | `curb-snapshot-v1` | Reject | Reject | Reject | Rejected by existing V2 manifest CHECK |
| `curb-decimal-v1` or unknown | Either/unknown | Reject | Reject | Reject | Unsupported identifier |

“Staging” in this matrix means feature staging, not merely inserting snapshot metadata. A malformed V1 metadata envelope can exist in STAGING under the old schema, but cannot pass strict V1 validation. V1 database validation retains its legacy-host pin; offline reconstruction of other historical endpoint variants does not silently authorize publication under a different contract.

### Dataset identity and endpoint provenance

The same registry UUID/source key `datasf_citywide_curbs`, provider `DATASF` and dataset `pep9-66vw` identify the logical source. A host migration is not a new dataset. Every immutable snapshot manifest retains the exact endpoint used during capture.

00014's replacement source-identity trigger still rejects changes to referenced source UUID/key/provider/dataset. It permits only `https://data.sfgov.org/resource` -> `https://data.sf.gov/resource` for this exact logical curb source. Reverse/unreviewed endpoint changes reject. The migration performs **no registry UPDATE** and grants no new registry write permissions. An authorized registry owner can make that explicit metadata upgrade later; synthetic local testing demonstrates it without changing V1 snapshots or creating a duplicate source. Production registration/upgrade remains a separately reviewed rollout step.

### Six separate states

1. **CAPTURE:** retained original bytes and manifests pass their versioned archive contract.
2. **ELIGIBILITY:** pure lossless checks establish DB-ingest eligibility; capture validity alone is insufficient.
3. **STAGING:** service-only TEXT RPC creates/reuses immutable versions and membership; supplied hashes are not proof.
4. **ATTESTATION:** independently authenticated verifier replays artifact bytes, recomputes hashes/counts/eligibility, compares complete authoritative DB TEXT and derives the membership seal.
5. **VALIDATION:** the verifier-only transaction checks that evidence against the locked complete snapshot, inserts the immutable attestation and switches to VALIDATED atomically.
6. **PUBLICATION:** service-only transaction accepts only validated, attested, sealed evidence and advances the pointer using the expected predecessor.

There is deliberately no persistent “attested but still mutable STAGING” state. Independent replay happens before the attestation call. Any intervening membership change produces a different seal or incomplete set and rejects the old evidence. Successful attestation and validation commit together and freeze membership. An identical retry by the same database verifier identity is a no-op; conflicting evidence/identity rejects. Failure after validation can leave immutable historical attestation attached to a FAILED snapshot; it does not authorize publication or resurrection.

### Exact V2 attestation contract

New table `public.city_parking_curb_attestations` has only:

- `snapshot_id uuid PRIMARY KEY`, `source_id uuid`, composite FK to the same snapshot/source (RESTRICT).
- `verifier_identity text NOT NULL`: database `session_user`, never a caller-supplied identity.
- `verified_at timestamptz`: server timestamp, finite.
- `evidence jsonb NOT NULL`: exact metadata object below. It contains no source numeric payload.

The verifier-only RPC is:

```sql
public.attest_city_parking_curb_snapshot_v2(
  p_source uuid, p_snapshot uuid, p_evidence jsonb
) RETURNS text
```

Required evidence keys (missing, extra, mismatching or incorrectly typed values reject):

| Key | Required value/binding |
|---|---|
| `artifact_sha256`, `manifest_sha256` | Digests independently checked against retained bytes and the immutable snapshot declarations |
| `dataset_sha256`, `identity_geometry_sha256` | Recomputed V2 dataset/identity-geometry hashes matching the snapshot |
| `row_count`, `distinct_external_id_count` | Complete staged/artifact identity counts, matching snapshot row count |
| `membership_sha256` | Exact V2 seal recomputed from current locked membership |
| `eligibility_version` | `curb-db-eligibility-v1` |
| `eligibility_state` | `ELIGIBLE` |
| `eligible_row_count`, `ineligible_row_count` | Snapshot row count / zero |
| `canonicalization_version`, `snapshot_version` | `curb-decimal-v2` / `curb-snapshot-v2` |
| `verifier_version` | `curb-artifact-verify-v2` |

The function requires STAGING, CONSISTENT, nonzero complete membership, exact provider/dataset/source/current capture endpoint, manifest versions/query/tool/timestamps/counts/schema/digest agreement and compatible immutable version metadata. Artifact/manifest URIs, checksums and snapshot digests remain required by 00012's existing NOT NULL/domain/URI constraints. The full evidence object is compared against expected immutable metadata and the freshly computed seal. Attestation time/identity/version/seal are copied into the existing snapshot verification fields, binding both records. A metadata-only forged VALIDATED row without the new attestation cannot publish.

UPDATE, DELETE and TRUNCATE of attestations are denied by existing-style immutable triggers. Application roles have no direct INSERT privilege. RLS exposes attestations only to the intended service/verifier readers; anon/authenticated/PUBLIC receive no access. One attestation row per snapshot prevents unversioned duplicate history. No source geometry or attributes are copied into the attestation table.

### V2 membership seal bytes

SHA-256 over UTF-8 of this exact concatenation:

```text
city-curb/db-membership/v2\n
<source UUID>:<snapshot UUID>:curb-decimal-v2:curb-snapshot-v2\n
<hex UTF-8 external_id>:<version UUID>:<geometry_sha256>:<attributes_sha256>:<content_sha256>
```

The displayed `\n` means one LF byte, not a literal backslash. Subsequent membership tuples are separated by one LF; there is no trailing LF after the last tuple. UUID text is lowercase normalized PostgreSQL UUID spelling. Sort by hex-encoded external ID under SQL `COLLATE "C"` / equivalent ASCII ordering in TypeScript. Hex encoding makes separators and Unicode unambiguous. The empty-set form contains only the two header lines but is never validation-eligible. [TypeScript implementation](../scripts/curb-v2-membership-seal.ts) agrees with SQL independent of enumeration. The V1 `city-curb/db-membership/v1` protocol is unchanged.

SQL hashes only stable textual IDs and existing digest fields; it does not canonicalize/hash numeric geometry or attribute JSON. Same content in a different snapshot produces a different V2 seal. This prevents replaying an attestation from another capture or source.

### Role separation and publication

`service_role` can stage, read and invoke publication/failure, but cannot attest, directly insert attestations, validate V1 or mutate snapshot verification fields. `curb_artifact_verifier` can read authoritative TEXT and create the intended attestation/validation, but cannot stage, change membership, publish or mutate historical rows. PUBLIC/anon/authenticated execution is revoked transactionally. Private helpers and preserved V1 implementations are not directly executable by application roles. SECURITY DEFINER uses executor ownership, qualified objects and fixed `pg_catalog, pg_temp` search paths.

The test uses distinct database login sessions (`curb_test_service` versus `curb_test_verifier`) and actual SET ROLE. `session_user` records the independently authenticated verifier login. A shared PostgREST authenticator would record that gateway login, not a human/verifier subject; production must provision and audit an independent verifier credential/identity path before rollout. No identity is accepted as a free-form RPC parameter. Owners/superusers remain outside the enforced application threat model.

Public V1 validation/publication signatures are preserved. Their original implementations are relocated to private `validate_snapshot_v1` / `publish_snapshot_v1`; wrappers dispatch only supported combinations. V2 publication checks completeness control metadata, exact attestation bindings, the current V2 seal, source lock, expected predecessor and capture chronology. It never traverses authoritative numeric JSON. PUBLISHED retries return ALREADY_CURRENT or ALREADY_PUBLISHED_NOT_CURRENT without moving the pointer backwards or refreshing timestamps.

### Local execution and limits

```powershell
pnpm.cmd exec tsx scripts/verify-curb-v2-publication.ts --local-disposable
pnpm.cmd exec tsx scripts/verify-curb-staging-rpc.ts --local-disposable
```

The new harness applies **every actual migration 00001 through 00014** to a fresh cached Supabase PostgreSQL 17.6 image as NOSUPERUSER `postgres`, then tests V1 history and a three-row synthetic V2 happy path. PostgreSQL runs with Docker network `none`, no published ports and Unix-socket role logins. Minimal Auth users/uid and realtime-publication prerequisites are provided for compilation; this does not test Supabase Auth/Realtime services. No extensions or PostGIS are installed.

It separately runs the existing 00012 behavior assertions against a second fresh 00001..00012 cluster. This is intentionally a historical checkpoint: 00013 revokes the direct service INSERT grants those old staging tests exercise. Running their old privilege expectations unchanged after 00013 would be incorrect. The existing harness gains only a tightly named/labeled disposable-container target; its behavior assertions remain unchanged. A local test-administrator statistics-read grant enables its cross-session lock observation; no migration/application role privileges are expanded for that test instrumentation. The 00013 verifier remains an independent fresh-cluster regression, and V1 validate/publish are additionally tested after 00014.

Coverage includes the requested cross-version/digest/eligibility failures, role denials, missing attestation, frozen membership/content, stale seals, replay from another snapshot, corrupted retained bytes, a dishonest staging payload/hash, identical retries, old-publication retries, source endpoint provenance, and concurrent publishers (one winner, one stale predecessor). Rejected operations compare complete database-state digests before/after. Synthetic artifact files and all disposable clusters/volumes are removed. The existing local project and production project `pffznlpmgtrpsejayicj` are untouched.

**Execution results:** all 00001..00014 files compiled successfully on fresh PostgreSQL 17.6; **71 V2 publication checks**, **132 original 00012 behavior checks**, and **71 original 00013 staging checks** passed. The first historical checkpoint run could not observe another session's lock wait because its minimal bootstrap lacked `pg_read_all_stats`; adding that test-administrator monitoring grant and rerunning from a fresh cluster resolved the instrumentation failure without changing migration SQL. Required checks also passed: typecheck, canonicalization **100 V2 + 34 V1**, publication static/protocol **41**, interval **38**, eligibility **33**, and `git diff --check`.

The current 18,355-row V2/source endpoint/version/count/zero-ineligible contract is compatible. A synthetic 18,355-row metadata envelope passes the actual schema but is correctly rejected as incomplete without all members. The real capture is not staged or published by this test. Prior full offline eligibility results remain applicable to that retained capture, not future source states.

Remaining production gates: reviewed migration/registration rollout (including explicit endpoint upgrade where needed), durable immutable artifact storage/retention, independently provisioned verifier authentication, and an operational full-archive verifier using the tested V2 contract. The synthetic replay tests are not a production ingestion/verification service. Runtime, legality, coverage, UI, AI, agent and MCP integrations remain unchanged. No commit is created.

**STATIC VERIFIED; POSTGRES COMPILED; LIFECYCLE TESTED; IMMUTABILITY TESTED; ROLLBACK TESTED; CONCURRENCY TESTED; RLS/PRIVILEGES TESTED — LOCALLY. PRODUCTION NOT APPLIED; PRODUCTION ROLLOUT BLOCKED.** [Migration 00012](../supabase/migrations/00012_city_parking_curb_storage.sql) applied successfully in fresh disposable Supabase PostgreSQL 17.6 after the ownership correction below. The local behavior harness subsequently passed 132 checks using synthetic fixtures. This refines the [storage](./CITY_CURB_STORAGE.md), [snapshot](./CITY_CURB_SNAPSHOT_CONTRACT.md), [interval](./CITY_CURB_INTERVAL_CONTRACT.md), and [association](./CITY_REGULATION_ASSOCIATION_STORAGE.md) contracts. No ingestion service or accepted associations were added. CITY remains **INCOMPLETE**.

## 1. Design decisions

Existing migrations use generated UUIDs, named CHECK/UNIQUE constraints, source FKs, `set_updated_at()`, RLS and restricted functions. Reuse those identity conventions, but do not attach mutable `updated_at` triggers to evidence. The registry provider is uppercase `DATASF`; canonical artifacts use lowercase `datasf`. Map those explicitly, never alter the existing registry enum/check or repurpose a source UUID.

**Lifecycle: STAGING -> VALIDATED -> PUBLISHED; STAGING/VALIDATED -> FAILED.** PUBLISHED and FAILED are terminal. There is no transition back to staging and no retry of FAILED in place. STAGING means materializing an already-retained capture into DB membership; network capture happens before creating this row. Snapshot input fields are frozen even in STAGING. Incorrect membership/envelope requires a new capture key; append-only retries cannot silently correct evidence. VALIDATED freezes membership before publication. Failure is a separate RPC transaction, never an exception handler that commits part of a failed publication.

**Current pointer:** a fourth, small `city_parking_curb_publications` table, one row per source. Its PK ensures zero or one current snapshot. Historical snapshots remain PUBLISHED; superseded means PUBLISHED but not pointed to and is derived. No `is_current`, registry current pointer, retired payload updates, or one-PUBLISHED-per-source partial index. This avoids an FK cycle in the registry and keeps publication concerns out of legacy ingestion. Generation starts at 1 and increases on each new publication.

All staging inserts, validation, failure and publication serialize on the existing **source row first**, then snapshot row. Use READ COMMITTED with VOLATILE guard functions; reject other isolation levels in this V1 interface rather than depending on stale transaction snapshots. PostgreSQL [row locks persist to transaction end](https://www.postgresql.org/docs/current/explicit-locking.html), and [VOLATILE functions obtain fresh query snapshots](https://www.postgresql.org/docs/current/xfunc-volatility.html). Source locking also coordinates source identity changes. No advisory-lock key hashing or client multi-statement transaction orchestration is needed.

Publication requires `expected_current_snapshot_id` (NULL for first publication). Different publishers starting from the same predecessor serialize; one commits, the other gets a stale-predecessor error. They do not silently replace each other in succession. Publication of an older/equal-time capture is also rejected. Retrying the same published snapshot returns ALREADY_CURRENT or ALREADY_PUBLISHED_NOT_CURRENT without moving a pointer backwards or changing timestamps.

## 2. Ownership and trust boundary

Schema, tables, domain and functions retain the migration executor's ownership, normally Supabase `postgres`, matching the existing project migrations. The separate non-login `curb_artifact_verifier` is a permission group only; no ownership or role membership is granted to it or to application roles. `service_role` can SELECT and INSERT staging snapshots, versions and membership, but cannot UPDATE/DELETE/TRUNCATE them or write the current pointer. It can invoke publication/failure RPCs; only the verifier receives validation EXECUTE. Provisioning an independently authenticated verifier remains deployment work; no login or credential is created here.

**Ownership compatibility correction:** the first local application failed with SQLSTATE 42501, `must be able to SET ROLE "curb_guard_owner"`, at `CREATE SCHEMA curb_private AUTHORIZATION curb_guard_owner`. Creating a NOLOGIN role does not imply permission to assume it. PostgreSQL requires SET ROLE ability for another role's schema ownership and subsequent object ownership transfers. The cached Supabase image explicitly demotes `postgres` to NOSUPERUSER; CREATEROLE alone does not satisfy this requirement. The correction removes the custom owner role, AUTHORIZATION and all ownership transfers, along with its unnecessary source policies/grants. The two invoker guards compare `current_user` against the protected relation's catalog owner, not a hardcoded role name. No SET ROLE or membership/superuser grants were added.

This chooses executor ownership over retaining a second owner through extra membership grants. It preserves the client/service/verifier access boundary and all lifecycle/immutability checks. SECURITY DEFINER functions now run with the existing administrative executor's broader privileges; fixed qualified SQL, no dynamic SQL, fixed search paths and narrow EXECUTE grants remain essential. The administrative owner was already outside the immutability threat model. Actual role and behavior tests remain required before rollout.

The independent verifier must restore the immutable artifact, verify its manifest/bytes and `curb-jcs-v1` hashes, compare every staged version's complete payload with source rows, confirm exact identity sets/counts/schema and produce a DB membership seal. It attests URI availability/retention, manifest authenticity, content/hash agreement and capture consistency. PostgreSQL cannot inspect arbitrary object-store bytes. The DB validates required attestation fields, shape and completeness, and binds the verified set immutably; it does not claim that a hex hash or a service-role assertion proves correct source bytes.

RLS has no client policies on the four tables. No anon/authenticated privileges are added. New SECURITY DEFINER functions use a fixed `pg_catalog, pg_temp` search path, qualified application objects, common migration-executor ownership and revoked PUBLIC execution; see [PostgreSQL SECURITY DEFINER guidance](https://www.postgresql.org/docs/current/sql-createfunction.html). No custom session variable is accepted as an authorization bypass. Service-role RLS bypass does not bypass ordinary revoked table privileges or ordinary triggers. Owners/superusers can change/disable schema security; administrative DDL and compromised verifier/owner credentials are outside the enforced trust boundary. Do not claim immutability against a superuser.

## 3. Reviewed SQL implemented in migration 00012 — applied locally only

The migration assumes existing Supabase roles and migration 00005, UTF-8 PostgreSQL with built-in `sha256(bytea)`, and fresh verifier-role/private-schema names. Execute as the normal migration administrator owning the existing project objects, with permission to create the verifier role. Everything below is enclosed in one transaction to avoid transient default PUBLIC function access. It creates no source row, extension or association table. Built-in [binary SHA-256](https://www.postgresql.org/docs/current/functions-binarystring.html) avoids requiring pgcrypto/PostGIS. The offline verifier requires exact agreement between this block and the actual migration after its banner. The ownership correction above is the only SQL behavior change from the initial reviewed implementation.

<!-- CURB_GUARD_SQL_BEGIN -->
```sql
BEGIN;

CREATE ROLE curb_artifact_verifier NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
-- Use the existing migration executor for schema/table/domain/function ownership.
-- Creating a NOLOGIN role does not grant SET ROLE, required for AUTHORIZATION
-- and ownership transfers. The verifier is a permission group, never an owner.
CREATE SCHEMA curb_private;
REVOKE ALL ON SCHEMA curb_private FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO curb_artifact_verifier;

CREATE DOMAIN curb_private.sha256_hex AS text
  CHECK (VALUE COLLATE "C" ~ '^[0-9a-f]{64}$');

CREATE TABLE public.city_parking_source_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.city_parking_sources(id) ON DELETE RESTRICT,
  capture_key text NOT NULL CHECK (length(btrim(capture_key)) > 0),
  provider text NOT NULL DEFAULT 'datasf' CHECK (provider = 'datasf'),
  dataset_id text NOT NULL DEFAULT 'pep9-66vw' CHECK (dataset_id = 'pep9-66vw'),
  retrieval_started_at timestamptz NOT NULL CHECK (isfinite(retrieval_started_at)),
  retrieval_completed_at timestamptz NOT NULL CHECK (isfinite(retrieval_completed_at)),
  canonicalization_version text NOT NULL CHECK (canonicalization_version = 'curb-jcs-v1'),
  fetch_tool_version text NOT NULL CHECK (length(btrim(fetch_tool_version)) > 0),
  consistency_state text NOT NULL CHECK (consistency_state IN ('CONSISTENT', 'POSSIBLY_CHANGED_DURING_CAPTURE', 'INVALID')),
  row_count integer NOT NULL CHECK (row_count BETWEEN 0 AND 100000),
  schema_sha256 curb_private.sha256_hex NOT NULL,
  source_content_sha256 curb_private.sha256_hex NOT NULL,
  identity_geometry_sha256 curb_private.sha256_hex NOT NULL,
  artifact_uri text NOT NULL CHECK (artifact_uri ~ '^[a-z][a-z0-9+.-]*://[^[:space:]?#]+$'),
  artifact_sha256 curb_private.sha256_hex NOT NULL,
  manifest_uri text NOT NULL CHECK (manifest_uri ~ '^[a-z][a-z0-9+.-]*://[^[:space:]?#]+$'),
  manifest_sha256 curb_private.sha256_hex NOT NULL,
  manifest jsonb NOT NULL CHECK (jsonb_typeof(manifest) = 'object'),
  lifecycle text NOT NULL DEFAULT 'STAGING' CHECK (lifecycle IN ('STAGING', 'VALIDATED', 'PUBLISHED', 'FAILED')),
  membership_sha256 curb_private.sha256_hex,
  artifact_verified_at timestamptz CHECK (isfinite(artifact_verified_at)),
  artifact_verification_version text,
  artifact_verified_by text,
  validated_at timestamptz CHECK (isfinite(validated_at)),
  published_at timestamptz CHECK (isfinite(published_at)),
  failed_at timestamptz CHECK (isfinite(failed_at)),
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (source_id, capture_key),
  UNIQUE (id, source_id),
  UNIQUE (id, source_id, lifecycle),
  CHECK (retrieval_completed_at >= retrieval_started_at),
  CHECK ((lifecycle = 'PUBLISHED') = (published_at IS NOT NULL)),
  CHECK ((lifecycle = 'FAILED') = (failed_at IS NOT NULL)),
  CHECK (lifecycle <> 'FAILED' OR (failure_reason IS NOT NULL AND length(btrim(failure_reason)) > 0)),
  CHECK (lifecycle NOT IN ('VALIDATED','PUBLISHED') OR (
    membership_sha256 IS NOT NULL AND artifact_verified_at IS NOT NULL AND validated_at IS NOT NULL
    AND artifact_verification_version IS NOT NULL AND length(btrim(artifact_verification_version)) > 0
    AND artifact_verified_by IS NOT NULL AND length(btrim(artifact_verified_by)) > 0))
);

CREATE TABLE public.city_parking_curb_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.city_parking_sources(id) ON DELETE RESTRICT,
  external_id text COLLATE "C" NOT NULL CHECK (length(btrim(external_id)) > 0 AND lower(btrim(external_id)) NOT IN ('null','<null>','none')),
  canonicalization_version text NOT NULL CHECK (canonicalization_version = 'curb-jcs-v1'),
  geometry_presence text NOT NULL CHECK (geometry_presence IN ('ABSENT','NULL','VALUE')),
  geometry_geojson jsonb,
  geometry_sha256 curb_private.sha256_hex NOT NULL,
  attributes_sha256 curb_private.sha256_hex NOT NULL,
  content_sha256 curb_private.sha256_hex NOT NULL,
  raw_source jsonb NOT NULL CHECK (jsonb_typeof(raw_source) = 'object' AND NOT (raw_source ? 'shape')),
  geometry_state text NOT NULL CHECK (geometry_state IN ('USABLE','MISSING','MALFORMED','UNSUPPORTED')),
  validation_version text NOT NULL CHECK (validation_version = 'curb-geometry-v1'),
  validation_reasons jsonb NOT NULL CHECK (jsonb_typeof(validation_reasons) = 'array'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (source_id, external_id, canonicalization_version, content_sha256),
  UNIQUE (id, source_id, external_id),
  CHECK (jsonb_typeof(raw_source -> 'globalid') IS NOT DISTINCT FROM 'string'),
  CHECK ((raw_source ->> 'globalid') IS NOT DISTINCT FROM external_id),
  CHECK ((geometry_presence IN ('ABSENT','NULL') AND geometry_geojson IS NULL)
      OR (geometry_presence = 'VALUE' AND geometry_geojson IS NOT NULL AND geometry_geojson <> 'null'::jsonb))
);

CREATE TABLE public.city_parking_curb_snapshot_features (
  snapshot_id uuid NOT NULL,
  source_id uuid NOT NULL,
  external_id text COLLATE "C" NOT NULL,
  curb_version_id uuid NOT NULL,
  PRIMARY KEY (snapshot_id, external_id),
  UNIQUE (snapshot_id, curb_version_id),
  FOREIGN KEY (snapshot_id, source_id)
    REFERENCES public.city_parking_source_snapshots(id, source_id) ON DELETE RESTRICT,
  FOREIGN KEY (curb_version_id, source_id, external_id)
    REFERENCES public.city_parking_curb_versions(id, source_id, external_id) ON DELETE RESTRICT
);

CREATE TABLE public.city_parking_curb_publications (
  source_id uuid PRIMARY KEY REFERENCES public.city_parking_sources(id) ON DELETE RESTRICT,
  snapshot_id uuid NOT NULL,
  snapshot_state text NOT NULL DEFAULT 'PUBLISHED' CHECK (snapshot_state = 'PUBLISHED'),
  generation bigint NOT NULL CHECK (generation > 0),
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (snapshot_id, source_id, snapshot_state)
    REFERENCES public.city_parking_source_snapshots(id, source_id, lifecycle) ON DELETE RESTRICT
);

CREATE INDEX city_curb_snapshots_source_time ON public.city_parking_source_snapshots(source_id, retrieval_completed_at DESC);
CREATE INDEX city_curb_members_version ON public.city_parking_curb_snapshot_features(curb_version_id);
-- The version content UNIQUE index already starts with (source_id, external_id).
-- No one-PUBLISHED-per-source index: history remains PUBLISHED; pointer PK governs current.

CREATE FUNCTION curb_private.lock_source(p_source uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $guard$
DECLARE s public.city_parking_sources%ROWTYPE;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Curb guard V1 requires READ COMMITTED';
  END IF;
  SELECT * INTO STRICT s FROM public.city_parking_sources WHERE id = p_source FOR UPDATE;
  IF s.provider <> 'DATASF' OR s.dataset_id <> 'pep9-66vw' OR s.source_key <> 'datasf_citywide_curbs'
    OR s.api_base_url <> 'https://data.sfgov.org/resource' THEN
    RAISE EXCEPTION 'Wrong curb source';
  END IF;
END;
$guard$;

CREATE FUNCTION curb_private.deny_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $guard$
BEGIN
  RAISE EXCEPTION 'Curb evidence UPDATE/DELETE/TRUNCATE forbidden';
END;
$guard$;

CREATE FUNCTION curb_private.stage_insert_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $guard$
DECLARE s public.city_parking_source_snapshots%ROWTYPE;
BEGIN
  PERFORM curb_private.lock_source(NEW.source_id);
  IF TG_TABLE_NAME IN ('city_parking_source_snapshots', 'city_parking_curb_versions') THEN
    NEW.created_at := clock_timestamp();
  END IF;
  IF TG_TABLE_NAME = 'city_parking_source_snapshots' THEN
    IF NEW.lifecycle <> 'STAGING' OR NEW.membership_sha256 IS NOT NULL
      OR NEW.artifact_verified_at IS NOT NULL OR NEW.artifact_verification_version IS NOT NULL
      OR NEW.artifact_verified_by IS NOT NULL OR NEW.validated_at IS NOT NULL
      OR NEW.published_at IS NOT NULL OR NEW.failed_at IS NOT NULL OR NEW.failure_reason IS NOT NULL THEN
      RAISE EXCEPTION 'Snapshot must start unattested STAGING';
    END IF;
  ELSIF TG_TABLE_NAME = 'city_parking_curb_snapshot_features' THEN
    SELECT * INTO STRICT s FROM public.city_parking_source_snapshots
      WHERE id = NEW.snapshot_id AND source_id = NEW.source_id FOR UPDATE;
    IF s.lifecycle <> 'STAGING' THEN RAISE EXCEPTION 'Membership is frozen'; END IF;
  END IF;
  RETURN NEW;
END;
$guard$;

CREATE FUNCTION curb_private.snapshot_transition_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $guard$
DECLARE allowed text[];
BEGIN
  IF current_user IS DISTINCT FROM (SELECT pg_catalog.pg_get_userbyid(c.relowner)
      FROM pg_catalog.pg_class c WHERE c.oid = TG_RELID) THEN
    RAISE EXCEPTION 'Use guarded lifecycle RPC';
  END IF;
  IF OLD.lifecycle = 'STAGING' AND NEW.lifecycle = 'VALIDATED' THEN
    allowed := ARRAY['lifecycle','membership_sha256','artifact_verified_at','artifact_verification_version','artifact_verified_by','validated_at'];
  ELSIF OLD.lifecycle = 'VALIDATED' AND NEW.lifecycle = 'PUBLISHED' THEN
    allowed := ARRAY['lifecycle','published_at'];
  ELSIF OLD.lifecycle IN ('STAGING','VALIDATED') AND NEW.lifecycle = 'FAILED' THEN
    allowed := ARRAY['lifecycle','failed_at','failure_reason'];
  ELSE RAISE EXCEPTION 'Forbidden snapshot transition';
  END IF;
  IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
    RAISE EXCEPTION 'Snapshot envelope is immutable';
  END IF;
  RETURN NEW;
END;
$guard$;

CREATE FUNCTION curb_private.pointer_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $guard$
BEGIN
  IF current_user IS DISTINCT FROM (SELECT pg_catalog.pg_get_userbyid(c.relowner)
      FROM pg_catalog.pg_class c WHERE c.oid = TG_RELID) THEN
    RAISE EXCEPTION 'Use publication RPC';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.generation <> 1 THEN RAISE EXCEPTION 'Invalid first generation'; END IF;
  ELSE
    IF NEW.source_id IS DISTINCT FROM OLD.source_id OR NEW.snapshot_id = OLD.snapshot_id
      OR NEW.generation <> OLD.generation + 1 THEN RAISE EXCEPTION 'Invalid pointer advance'; END IF;
  END IF;
  RETURN NEW;
END;
$guard$;

CREATE FUNCTION curb_private.source_identity_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $guard$
BEGIN
  IF ROW(NEW.id, NEW.source_key, NEW.provider, NEW.dataset_id, NEW.api_base_url)
      IS DISTINCT FROM ROW(OLD.id, OLD.source_key, OLD.provider, OLD.dataset_id, OLD.api_base_url)
    AND (EXISTS (SELECT 1 FROM public.city_parking_source_snapshots WHERE source_id = OLD.id)
      OR EXISTS (SELECT 1 FROM public.city_parking_curb_versions WHERE source_id = OLD.id)) THEN
    RAISE EXCEPTION 'Cannot repurpose referenced curb source';
  END IF;
  RETURN NEW;
END;
$guard$;

CREATE TRIGGER curb_source_identity BEFORE UPDATE ON public.city_parking_sources
  FOR EACH ROW EXECUTE FUNCTION curb_private.source_identity_guard();
CREATE TRIGGER curb_snapshot_insert BEFORE INSERT ON public.city_parking_source_snapshots
  FOR EACH ROW EXECUTE FUNCTION curb_private.stage_insert_guard();
CREATE TRIGGER curb_snapshot_transition BEFORE UPDATE ON public.city_parking_source_snapshots
  FOR EACH ROW EXECUTE FUNCTION curb_private.snapshot_transition_guard();
CREATE TRIGGER curb_snapshot_no_delete BEFORE DELETE ON public.city_parking_source_snapshots
  FOR EACH ROW EXECUTE FUNCTION curb_private.deny_mutation();
CREATE TRIGGER curb_snapshot_no_truncate BEFORE TRUNCATE ON public.city_parking_source_snapshots
  FOR EACH STATEMENT EXECUTE FUNCTION curb_private.deny_mutation();
CREATE TRIGGER curb_version_insert BEFORE INSERT ON public.city_parking_curb_versions
  FOR EACH ROW EXECUTE FUNCTION curb_private.stage_insert_guard();
CREATE TRIGGER curb_version_append_only BEFORE UPDATE OR DELETE ON public.city_parking_curb_versions
  FOR EACH ROW EXECUTE FUNCTION curb_private.deny_mutation();
CREATE TRIGGER curb_version_no_truncate BEFORE TRUNCATE ON public.city_parking_curb_versions
  FOR EACH STATEMENT EXECUTE FUNCTION curb_private.deny_mutation();
CREATE TRIGGER curb_member_insert BEFORE INSERT ON public.city_parking_curb_snapshot_features
  FOR EACH ROW EXECUTE FUNCTION curb_private.stage_insert_guard();
CREATE TRIGGER curb_member_append_only BEFORE UPDATE OR DELETE ON public.city_parking_curb_snapshot_features
  FOR EACH ROW EXECUTE FUNCTION curb_private.deny_mutation();
CREATE TRIGGER curb_member_no_truncate BEFORE TRUNCATE ON public.city_parking_curb_snapshot_features
  FOR EACH STATEMENT EXECUTE FUNCTION curb_private.deny_mutation();
CREATE TRIGGER curb_pointer_advance BEFORE INSERT OR UPDATE ON public.city_parking_curb_publications
  FOR EACH ROW EXECUTE FUNCTION curb_private.pointer_guard();
CREATE TRIGGER curb_pointer_no_delete BEFORE DELETE ON public.city_parking_curb_publications
  FOR EACH ROW EXECUTE FUNCTION curb_private.deny_mutation();
CREATE TRIGGER curb_pointer_no_truncate BEFORE TRUNCATE ON public.city_parking_curb_publications
  FOR EACH STATEMENT EXECUTE FUNCTION curb_private.deny_mutation();

CREATE FUNCTION curb_private.usable_line(g jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $guard$
DECLARE p jsonb; first_p jsonb; nonzero boolean := false; x numeric; y numeric;
BEGIN
  IF jsonb_typeof(g) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF (g ->> 'type') IS DISTINCT FROM 'LineString' THEN RETURN false; END IF;
  IF jsonb_typeof(g -> 'coordinates') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(g -> 'coordinates') < 2 THEN RETURN false; END IF;
  FOR p IN SELECT value FROM jsonb_array_elements(g -> 'coordinates') LOOP
    IF jsonb_typeof(p) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
    IF jsonb_array_length(p) <> 2 THEN RETURN false; END IF;
    IF jsonb_typeof(p -> 0) IS DISTINCT FROM 'number' OR jsonb_typeof(p -> 1) IS DISTINCT FROM 'number' THEN RETURN false; END IF;
    x := (p ->> 0)::numeric; y := (p ->> 1)::numeric;
    IF NOT (x BETWEEN -180 AND 180 AND y BETWEEN -90 AND 90) THEN RETURN false; END IF;
    IF first_p IS NULL THEN first_p := p; ELSIF p <> first_p THEN nonzero := true; END IF;
  END LOOP;
  RETURN nonzero;
END;
$guard$;

CREATE FUNCTION curb_private.membership_seal(p_snapshot uuid) RETURNS text
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $guard$
  SELECT encode(sha256(convert_to('city-curb/db-membership/v1' || chr(10) ||
    coalesce(string_agg(
      encode(convert_to(m.external_id, 'UTF8'), 'hex') || ':' || v.id::text || ':' ||
      v.geometry_sha256::text || ':' || v.attributes_sha256::text || ':' || v.content_sha256::text,
      chr(10) ORDER BY encode(convert_to(m.external_id, 'UTF8'), 'hex') COLLATE "C"), ''), 'UTF8')), 'hex')
  FROM public.city_parking_curb_snapshot_features m
  JOIN public.city_parking_curb_versions v ON (v.id, v.source_id, v.external_id) = (m.curb_version_id, m.source_id, m.external_id)
  WHERE m.snapshot_id = p_snapshot;
$guard$;

CREATE FUNCTION curb_private.assert_complete(p_snapshot uuid) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $guard$
DECLARE s public.city_parking_source_snapshots%ROWTYPE; n bigint; distinct_n bigint;
BEGIN
  SELECT * INTO STRICT s FROM public.city_parking_source_snapshots WHERE id = p_snapshot;
  IF s.consistency_state <> 'CONSISTENT' OR s.row_count <= 0 THEN RAISE EXCEPTION 'Capture is not eligible'; END IF;
  IF (s.manifest ->> 'format_version') IS DISTINCT FROM 'curb-snapshot-v1'
    OR (s.manifest ->> 'canonicalization_version') IS DISTINCT FROM s.canonicalization_version
    OR (s.manifest ->> 'provider') IS DISTINCT FROM s.provider
    OR (s.manifest ->> 'dataset_id') IS DISTINCT FROM s.dataset_id
    OR (s.manifest ->> 'source_key') IS DISTINCT FROM 'datasf_citywide_curbs'
    OR (s.manifest ->> 'api_endpoint') IS DISTINCT FROM 'https://data.sfgov.org/resource/pep9-66vw.json'
    OR (s.manifest ->> 'fetch_tool_version') IS DISTINCT FROM s.fetch_tool_version
    OR (s.manifest ->> 'captured_at_start')::timestamptz IS DISTINCT FROM s.retrieval_started_at
    OR (s.manifest ->> 'captured_at_end')::timestamptz IS DISTINCT FROM s.retrieval_completed_at
    OR (s.manifest -> 'query') IS DISTINCT FROM '{"select":"*","order":"globalid ASC","page_size":1000,"offset_step":1000,"filter":null}'::jsonb
    OR (s.manifest #>> '{summary,state}') IS DISTINCT FROM 'CONSISTENT'
    OR (s.manifest #>> '{summary,ordered}') IS DISTINCT FROM 'true'
    OR (s.manifest #>> '{summary,count_before}') IS DISTINCT FROM s.row_count::text
    OR (s.manifest #>> '{summary,count_after}') IS DISTINCT FROM s.row_count::text
    OR (s.manifest #>> '{summary,row_count}') IS DISTINCT FROM s.row_count::text
    OR (s.manifest #>> '{summary,distinct_external_id_count}') IS DISTINCT FROM s.row_count::text
    OR (s.manifest #>> '{summary,usable_geometry_count}') IS DISTINCT FROM s.row_count::text
    OR (s.manifest #>> '{summary,schema_before}') IS DISTINCT FROM s.schema_sha256::text
    OR (s.manifest #>> '{summary,schema_after}') IS DISTINCT FROM s.schema_sha256::text
    OR (s.manifest #>> '{summary,dataset_sha256}') IS DISTINCT FROM s.source_content_sha256::text
    OR (s.manifest #>> '{summary,identity_geometry_sha256}') IS DISTINCT FROM s.identity_geometry_sha256::text THEN
    RAISE EXCEPTION 'Manifest envelope mismatch';
  END IF;
  SELECT count(*), count(DISTINCT external_id) INTO n, distinct_n
    FROM public.city_parking_curb_snapshot_features WHERE snapshot_id = p_snapshot;
  IF n <> s.row_count OR distinct_n <> s.row_count THEN RAISE EXCEPTION 'Incomplete membership'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.city_parking_curb_snapshot_features m
    JOIN public.city_parking_curb_versions v ON v.id = m.curb_version_id
    WHERE m.snapshot_id = p_snapshot AND (m.source_id <> s.source_id OR v.source_id <> s.source_id
      OR v.external_id <> m.external_id OR v.canonicalization_version <> s.canonicalization_version
      OR v.geometry_state <> 'USABLE' OR v.geometry_presence <> 'VALUE'
      OR NOT curb_private.usable_line(v.geometry_geojson))) THEN RAISE EXCEPTION 'Invalid version membership';
  END IF;
  RETURN curb_private.membership_seal(p_snapshot);
END;
$guard$;

CREATE FUNCTION public.validate_city_parking_curb_snapshot(
  p_source uuid, p_snapshot uuid, p_manifest_sha256 text, p_membership_sha256 text,
  p_verification_version text) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $guard$
DECLARE s public.city_parking_source_snapshots%ROWTYPE; seal text;
BEGIN
  PERFORM curb_private.lock_source(p_source);
  SELECT * INTO STRICT s FROM public.city_parking_source_snapshots WHERE id = p_snapshot AND source_id = p_source FOR UPDATE;
  IF p_manifest_sha256 IS DISTINCT FROM s.manifest_sha256::text OR p_membership_sha256 IS NULL
    OR p_verification_version IS DISTINCT FROM 'curb-artifact-verify-v1' THEN RAISE EXCEPTION 'Invalid artifact attestation'; END IF;
  IF s.lifecycle IN ('VALIDATED','PUBLISHED') THEN
    IF p_membership_sha256 IS DISTINCT FROM s.membership_sha256::text
      OR p_verification_version IS DISTINCT FROM s.artifact_verification_version THEN RAISE EXCEPTION 'Conflicting validation retry'; END IF;
    RETURN 'ALREADY_VALIDATED';
  END IF;
  IF s.lifecycle <> 'STAGING' THEN RAISE EXCEPTION 'Cannot validate terminal failed snapshot'; END IF;
  seal := curb_private.assert_complete(p_snapshot);
  IF seal IS DISTINCT FROM p_membership_sha256 THEN RAISE EXCEPTION 'Verifier membership seal mismatch'; END IF;
  UPDATE public.city_parking_source_snapshots SET lifecycle = 'VALIDATED', membership_sha256 = seal,
    artifact_verified_at = clock_timestamp(), artifact_verification_version = p_verification_version,
    artifact_verified_by = session_user::text, validated_at = clock_timestamp() WHERE id = p_snapshot;
  RETURN 'VALIDATED';
END;
$guard$;

CREATE FUNCTION public.publish_city_parking_curb_snapshot(
  p_source uuid, p_snapshot uuid, p_expected_current uuid) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $guard$
DECLARE s public.city_parking_source_snapshots%ROWTYPE; current_id uuid; previous_capture_completed_at timestamptz; seal text;
BEGIN
  PERFORM curb_private.lock_source(p_source);
  SELECT * INTO STRICT s FROM public.city_parking_source_snapshots WHERE id = p_snapshot AND source_id = p_source FOR UPDATE;
  SELECT snapshot_id INTO current_id FROM public.city_parking_curb_publications WHERE source_id = p_source FOR UPDATE;
  IF s.lifecycle = 'PUBLISHED' THEN
    RETURN CASE WHEN current_id = p_snapshot THEN 'ALREADY_CURRENT' ELSE 'ALREADY_PUBLISHED_NOT_CURRENT' END;
  END IF;
  IF s.lifecycle <> 'VALIDATED' THEN RAISE EXCEPTION 'Snapshot must be VALIDATED'; END IF;
  IF current_id IS DISTINCT FROM p_expected_current THEN RAISE EXCEPTION 'Stale publication predecessor'; END IF;
  IF current_id IS NOT NULL THEN
    SELECT retrieval_completed_at INTO STRICT previous_capture_completed_at FROM public.city_parking_source_snapshots WHERE id = current_id;
    IF s.retrieval_completed_at <= previous_capture_completed_at THEN RAISE EXCEPTION 'Capture is not newer than current'; END IF;
  END IF;
  IF s.artifact_verified_at IS NULL OR s.artifact_verification_version IS DISTINCT FROM 'curb-artifact-verify-v1'
    OR s.artifact_verified_by IS NULL OR s.validated_at IS NULL THEN RAISE EXCEPTION 'Missing artifact verification'; END IF;
  seal := curb_private.assert_complete(p_snapshot);
  IF seal IS DISTINCT FROM s.membership_sha256::text THEN RAISE EXCEPTION 'Validated set changed'; END IF;
  UPDATE public.city_parking_source_snapshots SET lifecycle = 'PUBLISHED', published_at = clock_timestamp() WHERE id = p_snapshot;
  IF current_id IS NULL THEN
    INSERT INTO public.city_parking_curb_publications(source_id, snapshot_id, generation) VALUES (p_source, p_snapshot, 1);
  ELSE
    UPDATE public.city_parking_curb_publications SET snapshot_id = p_snapshot, generation = generation + 1,
      changed_at = clock_timestamp() WHERE source_id = p_source AND snapshot_id = p_expected_current;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pointer compare-and-set failed'; END IF;
  END IF;
  RETURN 'PUBLISHED';
END;
$guard$;

CREATE FUNCTION public.fail_city_parking_curb_snapshot(p_source uuid, p_snapshot uuid, p_reason text) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $guard$
DECLARE s public.city_parking_source_snapshots%ROWTYPE;
BEGIN
  PERFORM curb_private.lock_source(p_source);
  SELECT * INTO STRICT s FROM public.city_parking_source_snapshots WHERE id = p_snapshot AND source_id = p_source FOR UPDATE;
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN RAISE EXCEPTION 'Failure reason required'; END IF;
  IF s.lifecycle = 'FAILED' THEN RETURN 'ALREADY_FAILED'; END IF;
  IF s.lifecycle NOT IN ('STAGING','VALIDATED') THEN RAISE EXCEPTION 'Cannot fail published history'; END IF;
  UPDATE public.city_parking_source_snapshots SET lifecycle = 'FAILED', failed_at = clock_timestamp(), failure_reason = p_reason WHERE id = p_snapshot;
  RETURN 'FAILED';
END;
$guard$;

ALTER TABLE public.city_parking_source_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.city_parking_curb_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.city_parking_curb_snapshot_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.city_parking_curb_publications ENABLE ROW LEVEL SECURITY;
-- Owner bypass is deliberate for guarded functions; no FORCE RLS and no client policies.
REVOKE ALL ON public.city_parking_source_snapshots, public.city_parking_curb_versions,
  public.city_parking_curb_snapshot_features, public.city_parking_curb_publications FROM PUBLIC, anon, authenticated, service_role, curb_artifact_verifier;
GRANT SELECT ON public.city_parking_source_snapshots, public.city_parking_curb_versions,
  public.city_parking_curb_snapshot_features, public.city_parking_curb_publications TO service_role;
GRANT INSERT ON public.city_parking_source_snapshots, public.city_parking_curb_versions,
  public.city_parking_curb_snapshot_features TO service_role;
CREATE POLICY curb_verifier_read_snapshot ON public.city_parking_source_snapshots FOR SELECT TO curb_artifact_verifier USING (true);
CREATE POLICY curb_verifier_read_version ON public.city_parking_curb_versions FOR SELECT TO curb_artifact_verifier USING (true);
CREATE POLICY curb_verifier_read_member ON public.city_parking_curb_snapshot_features FOR SELECT TO curb_artifact_verifier USING (true);
CREATE POLICY curb_verifier_read_pointer ON public.city_parking_curb_publications FOR SELECT TO curb_artifact_verifier USING (true);
GRANT SELECT ON public.city_parking_source_snapshots, public.city_parking_curb_versions,
  public.city_parking_curb_snapshot_features, public.city_parking_curb_publications TO curb_artifact_verifier;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA curb_private FROM PUBLIC, anon, authenticated, service_role, curb_artifact_verifier;
REVOKE ALL ON FUNCTION public.validate_city_parking_curb_snapshot(uuid, uuid, text, text, text),
  public.publish_city_parking_curb_snapshot(uuid, uuid, uuid), public.fail_city_parking_curb_snapshot(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role, curb_artifact_verifier;
GRANT EXECUTE ON FUNCTION public.validate_city_parking_curb_snapshot(uuid, uuid, text, text, text) TO curb_artifact_verifier;
GRANT EXECUTE ON FUNCTION public.publish_city_parking_curb_snapshot(uuid, uuid, uuid),
  public.fail_city_parking_curb_snapshot(uuid, uuid, text) TO service_role;

COMMIT;
```
<!-- CURB_GUARD_SQL_END -->

## 4. Gate allocation and membership seal

Declarative rules: source/UUID namespaces, non-null version IDs, member PK/uniqueness, composite FK source/external-ID agreement, digest syntax, exact canonicalization version, artifact locator presence, and pointer-to-PUBLISHED FK. All new FKs use RESTRICT. No child mutation or truncation is permitted, even for FAILED captures. This deliberately avoids a cleanup loophole; future administrative retention cleanup requires a separate design. Snapshot deletion is always denied. Source identity fields freeze once a snapshot/version exists; unrelated legacy catalog counters/descriptions can still change, with historical metadata retained in immutable manifests.

Function gates: source/ownership scope, lock order, lifecycle, expected predecessor, newer observation, manifest scalar agreement, exact membership counts, distinct identities, structural usable 2D nonzero WGS84 LineStrings, attestation fields and membership seal equality. Geometry publishing is source-storage eligibility, not the more restrictive SF interval measurement/association eligibility. There is no consistency override: POSSIBLY_CHANGED_DURING_CAPTURE and INVALID cannot validate or publish. Zero rows are ineligible in V1, requiring a separately designed review path if an empty source is ever legitimate.

Offline verifier responsibilities: original byte checksums/retention, strict JSON/precision/Unicode and schema verification, canonical hashes, exact source-vs-DB identities/full payload equality, manifest authenticity, capture policy, and deployment attestor identity. SQL does not reimplement JCS with `jsonb::text`. A hash collision/conflicting payload under an existing version identity is rejected by tooling, not overwritten.

`membership_sha256` is a separate **DB-set seal**, not the canonical dataset digest. It includes the DB version UUID mapping. Encode each external ID's UTF-8 bytes as lowercase hex (avoids delimiter ambiguity); append `:uuid:geometry_hash:attributes_hash:content_hash`. Sort by the hex string under C collation; join rows with LF, no terminal LF, prefix `city-curb/db-membership/v1` plus LF, then SHA-256. Canonicalization is fixed by constraints; the seal is bound to the snapshot/source/manifest by the verifier RPC. This protocol can be computed without PostgreSQL from verifier-read rows and does not replace source-content hashes.

## 5. Publication transaction and races

Call one publication RPC inside a READ COMMITTED transaction. It locks the source, locks the candidate snapshot, reads/locks the current pointer, handles an already-published no-op, checks the expected predecessor and capture chronology, rechecks attestation/completeness/seal, transitions the candidate to PUBLISHED, advances the pointer/generation and returns. Caller COMMIT makes both visible; no catch-and-continue commits partial work. Any exception, FK failure, disconnect before commit, or transaction rollback preserves the previous current pointer and candidate's pre-call state. If commit succeeded but the response was lost, retry observes the published snapshot and no-ops.

Membership inserts use the same source-then-snapshot locks and reject non-STAGING parents. If insertion acquires the lock first, validation waits and sees the committed row. If validation freezes first, a late insertion is rejected. Concurrent inserts serialize by source; use bounded batches and one source per transaction. No per-row source lock can permit a partial set to pass while another writer commits behind the gate. Postgres execution tests remain necessary to validate this intended MVCC/trigger behavior.

All fields of a version are immutable from insertion. All snapshot input fields are immutable from insertion; only the narrowly allowed lifecycle/attestation timestamps change, and PUBLISHED/FAILED rows never update. Validation freezes membership and its seal. Published history has no editable operational notes; keep future operational logs outside these tables. Pointer metadata alone changes on successful publication, preserving each snapshot's original publication timestamp.

## 6. Retry and failure outcomes

| Event | Required outcome |
|---|---|
| Network failure before DB staging | Retain local failure evidence; no DB snapshot/current change |
| Snapshot exists, membership empty | Resume same capture key only after immutable envelope equality check |
| Partial membership | Append missing rows; verify conflicts reference exactly the expected version; no overwrite |
| Version conflict on source/external/canonical/content key | Reuse only after canonical full payload agreement; conflicting bytes/hash claims fail |
| Duplicate external ID in source capture | Reject capture, never hide it through SQL ON CONFLICT |
| Membership duplicate retry | An identical already-staged member may no-op; changed mapping rejects; frozen-stage writes reject, so retry first reads lifecycle |
| Complete VALIDATED snapshot | Revalidate with identical attestation is a no-op; publish once |
| Process dies during publication | Transaction rolls back unless commit already succeeded; retry detects either state |
| Two publishers race from same current | One advances; other fails stale-predecessor check; explicit re-evaluation required |
| Already published/current identical snapshot | Return ALREADY_CURRENT, no timestamp or generation change |
| Already published historical snapshot | Return ALREADY_PUBLISHED_NOT_CURRENT; never rewind pointer |
| FAILED capture retry | Terminal; retain history and use a new capture key for new work |
| Update published snapshot or any version | Trigger/privilege rejection |
| Delete history, member, version or pointer; TRUNCATE | Rejected; RESTRICT FKs also preserve references |
| Missing artifact attestation | Publication rejects; current unchanged |
| Count/set/manifest disagreement or invalid geometry | Validation/publication rejects; current unchanged |
| Non-CONSISTENT capture | Reject without override |
| Same geometry/digest under another external ID | Separate source identity/version, never merged |

## 7. Migration structure and verification boundary

Order: verifier permission role/private helpers namespace; digest domain; snapshot/version/member/pointer tables; indexes; focused insert/transition/append-only/source/pointer guards; geometry/seal/completeness helpers; validation/publication/failure RPCs; RLS and explicit grants/revocations; one enclosing transaction with unchanged executor ownership. FKs form a directed acyclic graph: members -> versions/snapshots -> source; pointer -> snapshots/source. No source->pointer reverse FK. Future associations reference versions with RESTRICT and validate snapshot membership, without cascading deletions or creating association tables here.

The original implementation environment lacked PostgreSQL/Docker. The user subsequently provisioned a local Supabase stack. The fresh retry used the cached `public.ecr.aws/supabase/postgres:17.6.1.167` image; PostgreSQL reports version **17.6**. Migration 00012 now compiles locally. Static checks remain separate: they do not validate runtime privileges or prove concurrent transaction behavior.

Verification command: `pnpm.cmd exec tsx scripts/verify-curb-publication-contract.ts`. The expanded verifier checks the migration against the reviewed SQL, sequential numbering, additive/no-top-level-write scope, table/function/trigger/policy/index ordering, FK dependency/unique-key shape, fixed search paths/owners, staging/terminal transition guards, current-pointer constraints, artifact and manifest requirements, service/verifier privilege separation, source-lock ordering, failure/first-publication/retry structure and the independent membership-seal byte protocol. The checks only read local files; they never execute SQL or contact a database. No PostgreSQL behavior is represented as tested by these assertions.

Ownership-fix verification: **41 static/protocol checks passed**; `pnpm.cmd typecheck` and `git diff --check` passed before local application. Fresh local commands:

```text
pnpm.cmd exec supabase stop --project-id smart-parking --no-backup
pnpm.cmd exec supabase start --exclude gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
```

The local database volume was confirmed absent before start. Migrations **00001 through 00012** applied in order; start exited **0**, with no next SQL error. The only seed warning was that `supabase/seed.sql` does not exist; no application seed ran. Other local services were excluded. Read-only catalogs confirmed all twelve migration versions, `postgres` ownership of the source table, four curb tables, private schema and twelve curb functions, RLS enabled on all four curb tables, and the declared SECURITY DEFINER/search_path settings. The `public` schema is owned by `pg_database_owner`. Local `postgres` is NOSUPERUSER with CREATEROLE/BYPASSRLS; the verifier has no login, superuser, CREATEROLE or BYPASSRLS, and `curb_guard_owner` does not exist. No credentials were printed. No production connection or write occurred.

The compilation-only stage above ended before behavior testing. The subsequent behavior stage preserved that healthy local stack, found no migration defect, and made no migration edit or reset/reapply. The repeatable [local DB harness](../scripts/verify-curb-publication-db.ts) passed **132 checks**, separately from the **41 static/protocol checks**; workspace/script typecheck also passed.

```text
pnpm.cmd verify:curb-publication-db --database-url=postgresql://postgres@127.0.0.1:54322/postgres
```

The URL is a password-free endpoint assertion. The harness rejects the production project ref, remote hosts, other ports and URL overrides before Docker access. It uses only the local Docker Desktop named pipe and `supabase_db_smart-parking`, verifies host port 54322 maps to container port 5432, and checks migration 00012 and synthetic-only source scope. It never loads `.env`, calls hosted APIs, resets the stack or runs ingest.

Fixtures use the source key `datasf_citywide_curbs` because the migration pins that identity; an arbitrary `test_curb_publication_v1` key correctly fails the source guard. The local row is explicitly labeled `LOCAL SYNTHETIC curb publication verification V1`; captures/external IDs have `test:`/`test-curb-` prefixes and per-run UUIDs. Three canonical LineString versions and one intentionally invalid Point fixture exercise membership and geometry checks. Artifact/manifest locations are `test://` placeholders. This proves SQL attestation enforcement, **not** retained-object existence or real independent artifact verification.

| Executed local behavior | Result |
|---|---|
| STAGING to VALIDATED | Attestation, timestamps and independently computed membership seal recorded; members unchanged; identical validation retry is a no-op |
| Validation failures | Both non-CONSISTENT states, missing attestation/seal, wrong seal, row/member/distinct counts and invalid geometry rejected; missing artifact/manifest fields reject at INSERT, missing version/mismatched identity reject by FK, wrong-source version rejects at staging |
| Publication and retries | First run creates generation 1; newer second snapshot advances to 2 once; current and historical retries do not mutate history/timestamps/generation |
| Stale predecessor / older capture | Both reject with the current pointer unchanged |
| Immutability | Published snapshot fields/DELETE, version payload/hash/DELETE, validated/published membership INSERT/UPDATE/DELETE, all four table TRUNCATEs and source repurposing rejected |
| FAILED | STAGING and VALIDATED can fail with a reason; retry is a no-op; validation/publication/return to STAGING rejected |
| Rollback | A transaction-local pointer CHECK constraint rejects publication after its snapshot transition; snapshot, pointer and generation remain unchanged; the test constraint also rolls back |
| Concurrent publication | Two independent psql sessions share the expected predecessor; observed loser waiting on `Lock/transactionid`, blocked by the winner while it holds a source-table lock; winner commits, loser rejects stale; exactly one advancement, no deadlock |
| Role execution | Actual anon/authenticated reads, writes and trusted RPC calls rejected; service stages/reads/publishes/fails but cannot validate or directly update the pointer; verifier reads/validates but cannot stage/mutate/publish/fail; private helpers denied to all four roles |
| SECURITY DEFINER | All six owned by local migration executor `postgres`; fixed `pg_catalog, pg_temp` paths; PUBLIC EXECUTE revoked; validation/publication, staging/failure and source-identity guards resist temporary relation/function shadows |
| Catalog | Four RLS-enabled tables owned by `postgres`; twelve functions; fourteen custom triggers; six RESTRICT FKs, four PKs, six UNIQUE constraints; twelve valid/ready indexes; four verifier-only SELECT policies |

The final full run (`eb6add46-b4f5-4493-934e-d2f3218a70cb`) exited 0. Its lock wait was observed **182 ms after launching the losing session**; this includes process startup/observation overhead, not an exact lock-duration measurement. A previous complete run passed 125 checks before target-rejection and additional shadow/private-helper checks were added. Reruns successfully advance from existing synthetic history with fresh capture keys and timestamps. Positive fixtures remain local because deleting them would violate the append-only contract; negative mutation tests and temporary shadow/rollback objects roll back. No automatic cleanup disables guards.

Test connections use the local `supabase_admin` role solely to switch transaction roles; no role memberships or production permissions are added. Operations run under `SET LOCAL ROLE postgres`, `service_role`, `curb_artifact_verifier`, `anon` or `authenticated` as appropriate. Thus attestation records local session identity `supabase_admin`; separate operational verifier authentication remains untested. The executed concurrency scenario is publisher versus publisher; additional staging-versus-validation race tests and hosted-role verification are not claimed.

Live double-capture validation, operational immutable object retention, real source registration and independent verifier authentication remain blockers for first production ingestion/validation/publication. **Migration statically verified, locally compiled and behavior-tested; production not applied or ready.** The migration contains no source registration or backfill. Distinct-ID/usable counts stay in the validated manifest; immutable evidence has no `updated_at`, and pointer changes use `changed_at`. Version UUIDs are stable future interval FK targets, but association tables and membership-aware association publication remain separate work. Production project `pffznlpmgtrpsejayicj` was never contacted during local testing. The existing interval/canonicalization contracts, runtime and CITY coverage are unchanged.
