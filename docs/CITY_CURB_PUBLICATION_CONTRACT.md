# City Curb Publication + Immutability Guards V1

**Design SQL and offline/static verification only. No migration file or database changes.** This refines the [storage](./CITY_CURB_STORAGE.md), [snapshot](./CITY_CURB_SNAPSHOT_CONTRACT.md), [interval](./CITY_CURB_INTERVAL_CONTRACT.md), and [association](./CITY_REGULATION_ASSOCIATION_STORAGE.md) contracts. It does not create an ingestion service or accepted associations. CITY remains **INCOMPLETE**.

## 1. Design decisions

Existing migrations use generated UUIDs, named CHECK/UNIQUE constraints, source FKs, `set_updated_at()`, RLS and restricted functions. Reuse those identity conventions, but do not attach mutable `updated_at` triggers to evidence. The registry provider is uppercase `DATASF`; canonical artifacts use lowercase `datasf`. Map those explicitly, never alter the existing registry enum/check or repurpose a source UUID.

**Lifecycle: STAGING -> VALIDATED -> PUBLISHED; STAGING/VALIDATED -> FAILED.** PUBLISHED and FAILED are terminal. There is no transition back to staging and no retry of FAILED in place. STAGING means materializing an already-retained capture into DB membership; network capture happens before creating this row. Snapshot input fields are frozen even in STAGING. Incorrect membership/envelope requires a new capture key; append-only retries cannot silently correct evidence. VALIDATED freezes membership before publication. Failure is a separate RPC transaction, never an exception handler that commits part of a failed publication.

**Current pointer:** a fourth, small `city_parking_curb_publications` table, one row per source. Its PK ensures zero or one current snapshot. Historical snapshots remain PUBLISHED; superseded means PUBLISHED but not pointed to and is derived. No `is_current`, registry current pointer, retired payload updates, or one-PUBLISHED-per-source partial index. This avoids an FK cycle in the registry and keeps publication concerns out of legacy ingestion. Generation starts at 1 and increases on each new publication.

All staging inserts, validation, failure and publication serialize on the existing **source row first**, then snapshot row. Use READ COMMITTED with VOLATILE guard functions; reject other isolation levels in this V1 interface rather than depending on stale transaction snapshots. PostgreSQL [row locks persist to transaction end](https://www.postgresql.org/docs/current/explicit-locking.html), and [VOLATILE functions obtain fresh query snapshots](https://www.postgresql.org/docs/current/xfunc-volatility.html). Source locking also coordinates source identity changes. No advisory-lock key hashing or client multi-statement transaction orchestration is needed.

Publication requires `expected_current_snapshot_id` (NULL for first publication). Different publishers starting from the same predecessor serialize; one commits, the other gets a stale-predecessor error. They do not silently replace each other in succession. Publication of an older/equal-time capture is also rejected. Retrying the same published snapshot returns ALREADY_CURRENT or ALREADY_PUBLISHED_NOT_CURRENT without moving a pointer backwards or changing timestamps.

## 2. Ownership and trust boundary

Proposed non-login owner `curb_guard_owner` owns new tables/functions. It is never granted to application/service roles. `service_role` can SELECT and INSERT staging snapshots, versions and membership, but cannot UPDATE/DELETE/TRUNCATE them or write the current pointer. It can invoke publication/failure RPCs. A separately provisioned `curb_artifact_verifier` role can invoke validation; do not grant it to service_role, anon or authenticated. Role provisioning/authentication remains deployment work, not a new credential created here.

The independent verifier must restore the immutable artifact, verify its manifest/bytes and `curb-jcs-v1` hashes, compare every staged version's complete payload with source rows, confirm exact identity sets/counts/schema and produce a DB membership seal. It attests URI availability/retention, manifest authenticity, content/hash agreement and capture consistency. PostgreSQL cannot inspect arbitrary object-store bytes. The DB validates required attestation fields, shape and completeness, and binds the verified set immutably; it does not claim that a hex hash or a service-role assertion proves correct source bytes.

RLS has no client policies on the four tables. No anon/authenticated privileges are added. New SECURITY DEFINER functions use a fixed `pg_catalog, pg_temp` search path, qualified application objects, explicit owner assignment and revoked PUBLIC execution; see [PostgreSQL SECURITY DEFINER guidance](https://www.postgresql.org/docs/current/sql-createfunction.html). No custom session variable is accepted as an authorization bypass. Service-role RLS bypass does not bypass ordinary revoked table privileges or ordinary triggers. Owners/superusers can change/disable schema security; administrative DDL and compromised verifier/owner credentials are outside the enforced trust boundary. Do not claim immutability against a superuser.

## 3. Exact future SQL draft — not applied, not a migration

The draft assumes existing Supabase roles and migration 00005, UTF-8 PostgreSQL with built-in `sha256(bytea)`, and fresh dedicated role/schema names. Creating ownership roles requires a suitably privileged migration administrator; compatibility with the eventual Supabase deployment must be tested locally first. Everything below would be installed in one transaction to avoid transient default PUBLIC function access. It creates no source row, extension or association table. Built-in [binary SHA-256](https://www.postgresql.org/docs/current/functions-binarystring.html) avoids requiring pgcrypto/PostGIS.

<!-- CURB_GUARD_SQL_BEGIN -->
```sql
BEGIN;

CREATE ROLE curb_guard_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE curb_artifact_verifier NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE SCHEMA curb_private AUTHORIZATION curb_guard_owner;
REVOKE ALL ON SCHEMA curb_private FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE, CREATE ON SCHEMA public TO curb_guard_owner;
GRANT USAGE ON SCHEMA public TO curb_artifact_verifier;
GRANT SELECT ON public.city_parking_sources TO curb_guard_owner;
GRANT UPDATE (id) ON public.city_parking_sources TO curb_guard_owner;
-- The owner does not own the existing registry and has no BYPASSRLS.
CREATE POLICY curb_owner_source_read ON public.city_parking_sources FOR SELECT TO curb_guard_owner
  USING (provider = 'DATASF' AND dataset_id = 'pep9-66vw' AND source_key = 'datasf_citywide_curbs');
CREATE POLICY curb_owner_source_lock ON public.city_parking_sources FOR UPDATE TO curb_guard_owner
  USING (provider = 'DATASF' AND dataset_id = 'pep9-66vw' AND source_key = 'datasf_citywide_curbs')
  WITH CHECK (provider = 'DATASF' AND dataset_id = 'pep9-66vw' AND source_key = 'datasf_citywide_curbs');

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
  IF current_user <> 'curb_guard_owner' THEN RAISE EXCEPTION 'Use guarded lifecycle RPC'; END IF;
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
  IF current_user <> 'curb_guard_owner' THEN RAISE EXCEPTION 'Use publication RPC'; END IF;
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

ALTER TABLE public.city_parking_source_snapshots OWNER TO curb_guard_owner;
ALTER TABLE public.city_parking_curb_versions OWNER TO curb_guard_owner;
ALTER TABLE public.city_parking_curb_snapshot_features OWNER TO curb_guard_owner;
ALTER TABLE public.city_parking_curb_publications OWNER TO curb_guard_owner;
ALTER DOMAIN curb_private.sha256_hex OWNER TO curb_guard_owner;
ALTER FUNCTION curb_private.lock_source(uuid) OWNER TO curb_guard_owner;
ALTER FUNCTION curb_private.deny_mutation() OWNER TO curb_guard_owner;
ALTER FUNCTION curb_private.stage_insert_guard() OWNER TO curb_guard_owner;
ALTER FUNCTION curb_private.snapshot_transition_guard() OWNER TO curb_guard_owner;
ALTER FUNCTION curb_private.pointer_guard() OWNER TO curb_guard_owner;
ALTER FUNCTION curb_private.source_identity_guard() OWNER TO curb_guard_owner;
ALTER FUNCTION curb_private.usable_line(jsonb) OWNER TO curb_guard_owner;
ALTER FUNCTION curb_private.membership_seal(uuid) OWNER TO curb_guard_owner;
ALTER FUNCTION curb_private.assert_complete(uuid) OWNER TO curb_guard_owner;
ALTER FUNCTION public.validate_city_parking_curb_snapshot(uuid, uuid, text, text, text) OWNER TO curb_guard_owner;
ALTER FUNCTION public.publish_city_parking_curb_snapshot(uuid, uuid, uuid) OWNER TO curb_guard_owner;
ALTER FUNCTION public.fail_city_parking_curb_snapshot(uuid, uuid, text) OWNER TO curb_guard_owner;

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
REVOKE CREATE ON SCHEMA public FROM curb_guard_owner;

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

Order: dedicated roles/private helpers namespace; digest domain; snapshot/version/member/pointer tables; indexes; focused insert/transition/append-only/source/pointer guards; geometry/seal/completeness helpers; validation/publication/failure RPCs; ownership, RLS and explicit grants/revocations; one enclosing transaction. FKs form a directed acyclic graph: members -> versions/snapshots -> source; pointer -> snapshots/source. No source->pointer reverse FK. Future associations reference versions with RESTRICT and validate snapshot membership, without cascading deletions or creating association tables here.

No `psql`, `postgres`, `initdb`, `pg_ctl` or Docker was found on PATH; standard PostgreSQL/Docker installation locations were absent. No local database was started or contacted. No installed PostgreSQL parser/embedded engine was found. Static checks can verify the draft's structure, constraints, declared dependencies, grants, guards and conceptual state/CAS/seal behavior; they **do not execute SQL, compile PL/pgSQL, validate actual privileges or prove concurrent transaction behavior**.

Verification command: `pnpm.cmd exec tsx scripts/verify-curb-publication-contract.ts`. **30 static/protocol checks passed**, including FK dependency/unique-key shape, fixed search paths/owners, staging/terminal transition guards, current-pointer constraints, artifact and manifest requirements, service/verifier privilege separation, source-lock ordering, rollback/no-op control-flow structure and the independent membership-seal byte protocol. `pnpm.cmd typecheck` passed. The checks only read local design/source files; they never execute SQL or contact a database. No PostgreSQL behavior is represented as tested by these assertions.

Database guard, immutability and concurrency **designs** are now explicit. Before converting the draft into a migration, an isolated PostgreSQL test must exercise DDL/function compilation, dedicated-role permissions, actual triggers, cascade/truncate rejection, two-session insertion/validation/publication races, rollback after the snapshot transition, and stale published retries. This engine validation is a technical schema-readiness gate, not a reason to connect to production.

Live double-capture validation and operational immutable object retention remain external/operational concerns. They do not intrinsically prevent installing an empty, fully tested schema, but they must block first production ingestion/validation/publication. **No migration file is created now because SQL/role/concurrency execution has not been validated locally. Schema is a reviewable draft, not execution-ready; production publication is not ready.** The existing interval/canonicalization contracts, runtime and CITY coverage are unchanged.
