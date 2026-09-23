-- City curb V2 eligibility and server-only TEXT staging boundary.
-- Forward-only: 00012 is unchanged. No source registration/backfill/extensions.
-- V1 evidence remains readable; V2 validation/publication stays blocked by
-- 00012's V1 completeness/attestation gates pending independent V2 verifier work.
-- See docs/CITY_CURB_INGESTION_BOUNDARY.md. NOT APPLIED TO PRODUCTION.
BEGIN;

ALTER TABLE public.city_parking_source_snapshots
  DROP CONSTRAINT city_parking_source_snapshots_canonicalization_version_check,
  ADD CONSTRAINT city_parking_source_snapshots_canonicalization_version_check
    CHECK (canonicalization_version IN ('curb-jcs-v1', 'curb-decimal-v2')),
  ADD CONSTRAINT city_curb_snapshot_v2_manifest_check CHECK (
    canonicalization_version <> 'curb-decimal-v2' OR (
      (manifest->>'format_version') IS NOT DISTINCT FROM 'curb-snapshot-v2'
      AND (manifest->>'canonicalization_version') IS NOT DISTINCT FROM 'curb-decimal-v2'
      AND (manifest->>'provider') IS NOT DISTINCT FROM 'datasf'
      AND (manifest->>'dataset_id') IS NOT DISTINCT FROM 'pep9-66vw'
      AND (manifest->>'source_key') IS NOT DISTINCT FROM 'datasf_citywide_curbs'
      AND (manifest->>'api_endpoint') IS NOT DISTINCT FROM 'https://data.sf.gov/resource/pep9-66vw.json'
    ));
ALTER TABLE public.city_parking_curb_versions
  DROP CONSTRAINT city_parking_curb_versions_canonicalization_version_check,
  ADD CONSTRAINT city_parking_curb_versions_canonicalization_version_check
    CHECK (canonicalization_version IN ('curb-jcs-v1', 'curb-decimal-v2'));

-- Explicitly recognize both known endpoints; do not mutate any registry row.
-- V2 staging below additionally requires the current endpoint.
CREATE OR REPLACE FUNCTION curb_private.lock_source(p_source uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $guard$
DECLARE s public.city_parking_sources%ROWTYPE;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Curb guard V1 requires READ COMMITTED';
  END IF;
  SELECT * INTO STRICT s FROM public.city_parking_sources WHERE id = p_source FOR UPDATE;
  IF s.provider <> 'DATASF' OR s.dataset_id <> 'pep9-66vw' OR s.source_key <> 'datasf_citywide_curbs'
    OR s.api_base_url NOT IN ('https://data.sfgov.org/resource', 'https://data.sf.gov/resource') THEN
    RAISE EXCEPTION 'Wrong curb source';
  END IF;
END;
$guard$;

-- JSONB already enforces PostgreSQL numeric range/Unicode validity. This walker
-- additionally enforces the lossless re-reader's depth, token and precision bounds.
-- It is not a JSON parser or V2 canonicalizer and never casts values to float.
CREATE FUNCTION curb_private.assert_v2_json(p_value jsonb, p_depth integer DEFAULT 0) RETURNS void
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $guard$
DECLARE child jsonb; token text; digits text;
BEGIN
  IF p_depth > 100 THEN RAISE EXCEPTION 'JSON_DEPTH_EXCEEDED' USING ERRCODE='22023'; END IF;
  CASE jsonb_typeof(p_value)
    WHEN 'number' THEN
      token := p_value::text;
      IF length(token) > 8192 THEN RAISE EXCEPTION 'NUMERIC_TOKEN_TOO_LONG' USING ERRCODE='22023'; END IF;
      digits := regexp_replace(regexp_replace(replace(ltrim(token, '-'), '.', ''), '^0+', ''), '0+$', '');
      IF length(digits) > 4096 THEN RAISE EXCEPTION 'NUMERIC_PRECISION_TOO_LARGE' USING ERRCODE='22023'; END IF;
    WHEN 'object' THEN
      FOR child IN SELECT value FROM jsonb_each(p_value) LOOP
        PERFORM curb_private.assert_v2_json(child, p_depth + 1);
      END LOOP;
    WHEN 'array' THEN
      FOR child IN SELECT value FROM jsonb_array_elements(p_value) LOOP
        PERFORM curb_private.assert_v2_json(child, p_depth + 1);
      END LOOP;
    ELSE NULL;
  END CASE;
END;
$guard$;

CREATE FUNCTION public.stage_city_parking_curb_version(
  p_source_id uuid, p_snapshot_id uuid, p_external_id text,
  p_canonical_feature_json text, p_geometry_sha256 text, p_attributes_sha256 text,
  p_content_sha256 text, p_canonicalization_version text
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $guard$
DECLARE s public.city_parking_source_snapshots%ROWTYPE;
  v public.city_parking_curb_versions%ROWTYPE; payload jsonb; version_id uuid; member_id uuid; trimmed_id text;
BEGIN
  IF p_canonicalization_version IS DISTINCT FROM 'curb-decimal-v2' THEN
    RAISE EXCEPTION 'UNSUPPORTED_CANONICALIZATION_VERSION' USING ERRCODE='22023';
  END IF;
  -- Match ECMAScript trim's whitespace set used by the capture identity guard.
  trimmed_id := btrim(p_external_id, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
  IF trimmed_id IS NULL OR length(trimmed_id) = 0
    OR lower(trimmed_id) IN ('null','<null>','none') THEN
    RAISE EXCEPTION 'INVALID_EXTERNAL_ID' USING ERRCODE='22023';
  END IF;
  IF p_geometry_sha256 IS NULL OR p_geometry_sha256 COLLATE "C" !~ '^[0-9a-f]{64}$'
    OR p_attributes_sha256 IS NULL OR p_attributes_sha256 COLLATE "C" !~ '^[0-9a-f]{64}$'
    OR p_content_sha256 IS NULL OR p_content_sha256 COLLATE "C" !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_HASH_FORMAT' USING ERRCODE='22023';
  END IF;
  IF p_canonical_feature_json IS NULL OR octet_length(p_canonical_feature_json) > 1048576 THEN
    RAISE EXCEPTION 'DOCUMENT_TOO_LARGE_OR_NULL' USING ERRCODE='22023';
  END IF;
  -- Any parse/range error aborts the entire RPC. Never coerce/repair source values.
  payload := p_canonical_feature_json::jsonb;
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'INVALID_FEATURE_OBJECT' USING ERRCODE='22023';
  END IF;
  -- Built-in JSON predicate checks original decoded keys, including nested keys,
  -- before duplicate information is discarded by JSONB. No custom SQL parser.
  IF NOT (p_canonical_feature_json IS JSON OBJECT WITH UNIQUE KEYS) THEN
    RAISE EXCEPTION 'DUPLICATE_JSON_KEY' USING ERRCODE='22023';
  END IF;
  IF octet_length(payload::text) > 1048576 THEN RAISE EXCEPTION 'DOCUMENT_TOO_LARGE' USING ERRCODE='22023'; END IF;
  PERFORM curb_private.assert_v2_json(payload);
  IF jsonb_typeof(payload->'globalid') IS DISTINCT FROM 'string'
    OR (payload->>'globalid') IS DISTINCT FROM p_external_id THEN
    RAISE EXCEPTION 'EXTERNAL_ID_MISMATCH' USING ERRCODE='22023';
  END IF;
  IF NOT curb_private.usable_line(payload->'shape') THEN
    RAISE EXCEPTION 'INVALID_FEATURE_SHAPE' USING ERRCODE='22023';
  END IF;

  -- All writes share 00012's source-first serialization and immutable guards.
  PERFORM curb_private.lock_source(p_source_id);
  IF (SELECT api_base_url FROM public.city_parking_sources WHERE id=p_source_id)
      IS DISTINCT FROM 'https://data.sf.gov/resource' THEN RAISE EXCEPTION 'Wrong V2 source endpoint'; END IF;
  SELECT * INTO STRICT s FROM public.city_parking_source_snapshots
    WHERE id=p_snapshot_id AND source_id=p_source_id FOR UPDATE;
  IF s.lifecycle <> 'STAGING' THEN RAISE EXCEPTION 'Snapshot must be STAGING'; END IF;
  IF s.canonicalization_version <> p_canonicalization_version THEN RAISE EXCEPTION 'Snapshot version mismatch'; END IF;

  INSERT INTO public.city_parking_curb_versions (
    source_id, external_id, canonicalization_version, geometry_presence, geometry_geojson,
    geometry_sha256, attributes_sha256, content_sha256, raw_source,
    geometry_state, validation_version, validation_reasons
  ) VALUES (
    p_source_id, p_external_id, p_canonicalization_version, 'VALUE', payload->'shape',
    p_geometry_sha256, p_attributes_sha256, p_content_sha256, payload-'shape',
    'USABLE', 'curb-geometry-v1', '[]'::jsonb
  ) ON CONFLICT (source_id, external_id, canonicalization_version, content_sha256) DO NOTHING
  RETURNING id INTO version_id;
  SELECT * INTO STRICT v FROM public.city_parking_curb_versions
    WHERE source_id=p_source_id AND external_id=p_external_id
      AND canonicalization_version=p_canonicalization_version AND content_sha256=p_content_sha256;
  -- Same claimed content hash must not conceal different bytes/geometry/hash fields.
  IF v.geometry_geojson IS DISTINCT FROM payload->'shape' OR v.raw_source IS DISTINCT FROM payload-'shape'
    OR v.geometry_sha256::text IS DISTINCT FROM p_geometry_sha256
    OR v.attributes_sha256::text IS DISTINCT FROM p_attributes_sha256
    OR v.geometry_presence <> 'VALUE' OR v.geometry_state <> 'USABLE'
    OR v.validation_version <> 'curb-geometry-v1' OR v.validation_reasons <> '[]'::jsonb THEN
    RAISE EXCEPTION 'Conflicting immutable version';
  END IF;
  version_id := v.id;
  SELECT curb_version_id INTO member_id FROM public.city_parking_curb_snapshot_features
    WHERE snapshot_id=p_snapshot_id AND external_id=p_external_id;
  IF FOUND THEN
    IF member_id <> version_id THEN RAISE EXCEPTION 'Conflicting snapshot membership'; END IF;
  ELSE
    INSERT INTO public.city_parking_curb_snapshot_features(snapshot_id, source_id, external_id, curb_version_id)
      VALUES (p_snapshot_id, p_source_id, p_external_id, version_id);
  END IF;
  RETURN version_id;
END;
$guard$;

CREATE FUNCTION public.read_city_parking_curb_version(p_curb_version_id uuid)
RETURNS TABLE (id uuid, source_id uuid, external_id text, canonicalization_version text,
  geometry_presence text, geometry_json_text text, raw_source_json_text text,
  geometry_sha256 text, attributes_sha256 text, content_sha256 text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $guard$
  SELECT v.id, v.source_id, v.external_id, v.canonicalization_version, v.geometry_presence,
    v.geometry_geojson::text, v.raw_source::text, v.geometry_sha256::text,
    v.attributes_sha256::text, v.content_sha256::text
  FROM public.city_parking_curb_versions v WHERE v.id=p_curb_version_id;
$guard$;

-- SECURITY DEFINER is required: service_role cannot bypass eligibility with a
-- direct INSERT. Ownership remains the migration executor as in 00012.
REVOKE INSERT ON public.city_parking_curb_versions, public.city_parking_curb_snapshot_features FROM service_role;
REVOKE ALL ON FUNCTION curb_private.assert_v2_json(jsonb, integer)
  FROM PUBLIC, anon, authenticated, service_role, curb_artifact_verifier;
REVOKE ALL ON FUNCTION public.stage_city_parking_curb_version(uuid,uuid,text,text,text,text,text,text),
  public.read_city_parking_curb_version(uuid) FROM PUBLIC, anon, authenticated, service_role, curb_artifact_verifier;
GRANT EXECUTE ON FUNCTION public.stage_city_parking_curb_version(uuid,uuid,text,text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_city_parking_curb_version(uuid) TO service_role, curb_artifact_verifier;
COMMIT;
