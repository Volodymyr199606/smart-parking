-- Forward V2 attestation/validation/publication compatibility. LOCAL TESTED ONLY.
-- No edits to 00012/00013, registrations, source data, extensions or runtime.
-- V1 remains curb-jcs-v1 (curb-decimal-v1 has never been a supported contract).
BEGIN;

-- Logical identity remains immutable. Permit only the reviewed legacy -> current
-- endpoint metadata upgrade for this same source, without rewriting capture URLs
-- or creating a second logical dataset. This migration updates no registry row.
CREATE OR REPLACE FUNCTION curb_private.source_identity_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM public.city_parking_source_snapshots WHERE source_id=OLD.id)
    OR EXISTS (SELECT 1 FROM public.city_parking_curb_versions WHERE source_id=OLD.id) THEN
    IF ROW(NEW.id,NEW.source_key,NEW.provider,NEW.dataset_id) IS DISTINCT FROM ROW(OLD.id,OLD.source_key,OLD.provider,OLD.dataset_id) THEN
      RAISE EXCEPTION 'Cannot repurpose referenced curb source';
    END IF;
    IF NEW.api_base_url IS DISTINCT FROM OLD.api_base_url AND NOT (
      OLD.source_key='datasf_citywide_curbs' AND OLD.provider='DATASF' AND OLD.dataset_id='pep9-66vw'
      AND OLD.api_base_url='https://data.sfgov.org/resource' AND NEW.api_base_url='https://data.sf.gov/resource') THEN
      RAISE EXCEPTION 'Unreviewed referenced curb endpoint change';
    END IF;
  END IF;
  RETURN NEW;
END;
$guard$;

CREATE TABLE public.city_parking_curb_attestations (
  snapshot_id uuid PRIMARY KEY,
  source_id uuid NOT NULL,
  verifier_identity text NOT NULL CHECK (length(btrim(verifier_identity)) > 0),
  verified_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK (isfinite(verified_at)),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  FOREIGN KEY (snapshot_id, source_id) REFERENCES public.city_parking_source_snapshots(id, source_id) ON DELETE RESTRICT
);
COMMENT ON TABLE public.city_parking_curb_attestations IS
  'Immutable V2 verifier evidence, bound to source/snapshot and committed atomically with VALIDATED. Not source numeric JSON.';
CREATE TRIGGER curb_attestation_append_only BEFORE UPDATE OR DELETE ON public.city_parking_curb_attestations
  FOR EACH ROW EXECUTE FUNCTION curb_private.deny_mutation();
CREATE TRIGGER curb_attestation_no_truncate BEFORE TRUNCATE ON public.city_parking_curb_attestations
  FOR EACH STATEMENT EXECUTE FUNCTION curb_private.deny_mutation();
ALTER TABLE public.city_parking_curb_attestations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.city_parking_curb_attestations FROM PUBLIC, anon, authenticated, service_role, curb_artifact_verifier;
GRANT SELECT ON public.city_parking_curb_attestations TO service_role, curb_artifact_verifier;
CREATE POLICY curb_attestation_verifier_read ON public.city_parking_curb_attestations FOR SELECT TO curb_artifact_verifier USING (true);

CREATE FUNCTION curb_private.membership_seal_v2(p_snapshot uuid) RETURNS text
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $guard$
  SELECT encode(sha256(convert_to('city-curb/db-membership/v2' || chr(10) ||
    s.source_id::text || ':' || s.id::text || ':curb-decimal-v2:curb-snapshot-v2' || chr(10) ||
    coalesce((SELECT string_agg(
      encode(convert_to(m.external_id,'UTF8'),'hex') || ':' || v.id::text || ':' ||
      v.geometry_sha256::text || ':' || v.attributes_sha256::text || ':' || v.content_sha256::text,
      chr(10) ORDER BY encode(convert_to(m.external_id,'UTF8'),'hex') COLLATE "C")
      FROM public.city_parking_curb_snapshot_features m JOIN public.city_parking_curb_versions v
        ON (v.id,v.source_id,v.external_id)=(m.curb_version_id,m.source_id,m.external_id)
      WHERE m.snapshot_id=s.id),''),'UTF8')),'hex')
  FROM public.city_parking_source_snapshots s WHERE s.id=p_snapshot;
$guard$;

-- Completeness reads manifest/control fields and immutable identity/hash metadata.
-- No geometry payload parsing or numeric re-canonicalization during publication.
CREATE FUNCTION curb_private.assert_complete_v2(p_snapshot uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $guard$
DECLARE s public.city_parking_source_snapshots%ROWTYPE; n bigint; distinct_n bigint;
BEGIN
  SELECT * INTO STRICT s FROM public.city_parking_source_snapshots WHERE id=p_snapshot;
  IF s.canonicalization_version <> 'curb-decimal-v2' OR s.consistency_state <> 'CONSISTENT' OR s.row_count <= 0 THEN
    RAISE EXCEPTION 'Capture is not eligible V2';
  END IF;
  IF (s.manifest->>'format_version') IS DISTINCT FROM 'curb-snapshot-v2'
    OR (s.manifest->>'canonicalization_version') IS DISTINCT FROM s.canonicalization_version
    OR (s.manifest->>'provider') IS DISTINCT FROM s.provider
    OR (s.manifest->>'dataset_id') IS DISTINCT FROM s.dataset_id
    OR (s.manifest->>'source_key') IS DISTINCT FROM 'datasf_citywide_curbs'
    OR (s.manifest->>'api_endpoint') IS DISTINCT FROM 'https://data.sf.gov/resource/pep9-66vw.json'
    OR (s.manifest->>'fetch_tool_version') IS DISTINCT FROM s.fetch_tool_version
    OR (s.manifest->>'captured_at_start')::timestamptz IS DISTINCT FROM s.retrieval_started_at
    OR (s.manifest->>'captured_at_end')::timestamptz IS DISTINCT FROM s.retrieval_completed_at
    OR (s.manifest->'query') IS DISTINCT FROM '{"select":"*","order":"globalid ASC","page_size":1000,"offset_step":1000,"filter":null}'::jsonb
    OR (s.manifest#>>'{summary,state}') IS DISTINCT FROM 'CONSISTENT'
    OR (s.manifest#>>'{summary,ordered}') IS DISTINCT FROM 'true'
    OR (s.manifest#>>'{summary,count_before}') IS DISTINCT FROM s.row_count::text
    OR (s.manifest#>>'{summary,count_after}') IS DISTINCT FROM s.row_count::text
    OR (s.manifest#>>'{summary,row_count}') IS DISTINCT FROM s.row_count::text
    OR (s.manifest#>>'{summary,distinct_external_id_count}') IS DISTINCT FROM s.row_count::text
    OR (s.manifest#>>'{summary,usable_geometry_count}') IS DISTINCT FROM s.row_count::text
    OR (s.manifest#>>'{summary,schema_before}') IS DISTINCT FROM s.schema_sha256::text
    OR (s.manifest#>>'{summary,schema_after}') IS DISTINCT FROM s.schema_sha256::text
    OR (s.manifest#>>'{summary,dataset_sha256}') IS DISTINCT FROM s.source_content_sha256::text
    OR (s.manifest#>>'{summary,identity_geometry_sha256}') IS DISTINCT FROM s.identity_geometry_sha256::text THEN
    RAISE EXCEPTION 'V2 manifest envelope mismatch';
  END IF;
  SELECT count(*),count(DISTINCT external_id) INTO n,distinct_n FROM public.city_parking_curb_snapshot_features WHERE snapshot_id=p_snapshot;
  IF n <> s.row_count OR distinct_n <> s.row_count THEN RAISE EXCEPTION 'Incomplete V2 membership'; END IF;
  IF EXISTS (SELECT 1 FROM public.city_parking_curb_snapshot_features m JOIN public.city_parking_curb_versions v ON v.id=m.curb_version_id
    WHERE m.snapshot_id=p_snapshot AND (m.source_id<>s.source_id OR v.source_id<>s.source_id OR v.external_id<>m.external_id
      OR v.canonicalization_version<>'curb-decimal-v2' OR v.geometry_state<>'USABLE' OR v.geometry_presence<>'VALUE'
      OR v.validation_version<>'curb-geometry-v1' OR v.validation_reasons<>'[]'::jsonb)) THEN
    RAISE EXCEPTION 'Invalid V2 version membership';
  END IF;
END;
$guard$;

CREATE FUNCTION curb_private.expected_evidence_v2(p_snapshot uuid) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $guard$
  SELECT jsonb_build_object(
    'artifact_sha256',s.artifact_sha256::text,'manifest_sha256',s.manifest_sha256::text,
    'dataset_sha256',s.source_content_sha256::text,'identity_geometry_sha256',s.identity_geometry_sha256::text,
    'row_count',s.row_count,'distinct_external_id_count',s.row_count,
    'membership_sha256',curb_private.membership_seal_v2(s.id),
    'eligibility_version','curb-db-eligibility-v1','eligibility_state','ELIGIBLE',
    'eligible_row_count',s.row_count,'ineligible_row_count',0,
    'canonicalization_version','curb-decimal-v2','snapshot_version','curb-snapshot-v2',
    'verifier_version','curb-artifact-verify-v2')
  FROM public.city_parking_source_snapshots s WHERE s.id=p_snapshot;
$guard$;

CREATE FUNCTION curb_private.assert_attestation_v2(p_snapshot uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $guard$
DECLARE s public.city_parking_source_snapshots%ROWTYPE; a public.city_parking_curb_attestations%ROWTYPE;
BEGIN
  SELECT * INTO STRICT s FROM public.city_parking_source_snapshots WHERE id=p_snapshot;
  SELECT * INTO a FROM public.city_parking_curb_attestations WHERE snapshot_id=p_snapshot AND source_id=s.source_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing independent V2 attestation'; END IF;
  IF a.evidence IS DISTINCT FROM curb_private.expected_evidence_v2(s.id)
    OR s.membership_sha256::text IS DISTINCT FROM (a.evidence->>'membership_sha256')
    OR s.artifact_verified_at IS DISTINCT FROM a.verified_at OR s.validated_at IS DISTINCT FROM a.verified_at
    OR s.artifact_verified_by IS DISTINCT FROM a.verifier_identity
    OR s.artifact_verification_version IS DISTINCT FROM 'curb-artifact-verify-v2' THEN
    RAISE EXCEPTION 'Stale or unbound V2 attestation';
  END IF;
END;
$guard$;

-- One atomic boundary: source lock -> snapshot lock -> exact evidence check ->
-- immutable attestation INSERT -> VALIDATED (membership freezes in this commit).
-- p_evidence contains only control counts and textual identities/digests, never
-- authoritative geometry/source JSON. The verifier must derive it independently.
CREATE FUNCTION public.attest_city_parking_curb_snapshot_v2(p_source uuid,p_snapshot uuid,p_evidence jsonb) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $guard$
DECLARE s public.city_parking_source_snapshots%ROWTYPE; a public.city_parking_curb_attestations%ROWTYPE;
BEGIN
  PERFORM curb_private.lock_source(p_source);
  SELECT * INTO STRICT s FROM public.city_parking_source_snapshots WHERE id=p_snapshot AND source_id=p_source FOR UPDATE;
  PERFORM curb_private.assert_complete_v2(s.id);
  IF p_evidence IS DISTINCT FROM curb_private.expected_evidence_v2(s.id) THEN RAISE EXCEPTION 'V2 verifier evidence mismatch'; END IF;
  IF s.lifecycle IN ('VALIDATED','PUBLISHED') THEN
    PERFORM curb_private.assert_attestation_v2(s.id);
    SELECT * INTO STRICT a FROM public.city_parking_curb_attestations WHERE snapshot_id=s.id;
    IF a.verifier_identity IS DISTINCT FROM session_user::text THEN RAISE EXCEPTION 'Conflicting verifier identity'; END IF;
    RETURN 'ALREADY_VALIDATED';
  END IF;
  IF s.lifecycle <> 'STAGING' THEN RAISE EXCEPTION 'V2 attestation requires STAGING'; END IF;
  INSERT INTO public.city_parking_curb_attestations(snapshot_id,source_id,verifier_identity,evidence)
    VALUES (s.id,s.source_id,session_user::text,p_evidence) RETURNING * INTO a;
  UPDATE public.city_parking_source_snapshots SET lifecycle='VALIDATED',membership_sha256=p_evidence->>'membership_sha256',
    artifact_verified_at=a.verified_at,artifact_verification_version='curb-artifact-verify-v2',
    artifact_verified_by=a.verifier_identity,validated_at=a.verified_at WHERE id=s.id;
  RETURN 'VALIDATED';
END;
$guard$;

-- Preserve original V1 implementations and their contracts in the private schema.
ALTER FUNCTION public.validate_city_parking_curb_snapshot(uuid,uuid,text,text,text) RENAME TO validate_snapshot_v1;
ALTER FUNCTION public.validate_snapshot_v1(uuid,uuid,text,text,text) SET SCHEMA curb_private;
ALTER FUNCTION public.publish_city_parking_curb_snapshot(uuid,uuid,uuid) RENAME TO publish_snapshot_v1;
ALTER FUNCTION public.publish_snapshot_v1(uuid,uuid,uuid) SET SCHEMA curb_private;
REVOKE ALL ON FUNCTION curb_private.validate_snapshot_v1(uuid,uuid,text,text,text),curb_private.publish_snapshot_v1(uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role,curb_artifact_verifier;

CREATE FUNCTION public.validate_city_parking_curb_snapshot(p_source uuid,p_snapshot uuid,p_manifest_sha256 text,p_membership_sha256 text,p_verification_version text) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $guard$
BEGIN
  IF (SELECT canonicalization_version FROM public.city_parking_source_snapshots WHERE id=p_snapshot AND source_id=p_source)
    IS DISTINCT FROM 'curb-jcs-v1' THEN RAISE EXCEPTION 'V1 validation only; V2 requires independent V2 attestation'; END IF;
  RETURN curb_private.validate_snapshot_v1(p_source,p_snapshot,p_manifest_sha256,p_membership_sha256,p_verification_version);
END;
$guard$;

CREATE FUNCTION public.publish_city_parking_curb_snapshot(p_source uuid,p_snapshot uuid,p_expected_current uuid) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $guard$
DECLARE s public.city_parking_source_snapshots%ROWTYPE; current_id uuid; previous_time timestamptz;
BEGIN
  PERFORM curb_private.lock_source(p_source);
  SELECT * INTO STRICT s FROM public.city_parking_source_snapshots WHERE id=p_snapshot AND source_id=p_source FOR UPDATE;
  IF s.canonicalization_version='curb-jcs-v1' THEN RETURN curb_private.publish_snapshot_v1(p_source,p_snapshot,p_expected_current); END IF;
  IF s.canonicalization_version<>'curb-decimal-v2' THEN RAISE EXCEPTION 'Unsupported publication contract'; END IF;
  SELECT snapshot_id INTO current_id FROM public.city_parking_curb_publications WHERE source_id=p_source FOR UPDATE;
  IF s.lifecycle NOT IN ('VALIDATED','PUBLISHED') THEN RAISE EXCEPTION 'Snapshot must be VALIDATED'; END IF;
  PERFORM curb_private.assert_complete_v2(s.id);
  PERFORM curb_private.assert_attestation_v2(s.id);
  IF s.lifecycle='PUBLISHED' THEN
    RETURN CASE WHEN current_id=s.id THEN 'ALREADY_CURRENT' ELSE 'ALREADY_PUBLISHED_NOT_CURRENT' END;
  END IF;
  IF current_id IS DISTINCT FROM p_expected_current THEN RAISE EXCEPTION 'Stale publication predecessor'; END IF;
  IF current_id IS NOT NULL THEN
    SELECT retrieval_completed_at INTO STRICT previous_time FROM public.city_parking_source_snapshots WHERE id=current_id;
    IF s.retrieval_completed_at<=previous_time THEN RAISE EXCEPTION 'Capture is not newer than current'; END IF;
  END IF;
  UPDATE public.city_parking_source_snapshots SET lifecycle='PUBLISHED',published_at=clock_timestamp() WHERE id=s.id;
  IF current_id IS NULL THEN
    INSERT INTO public.city_parking_curb_publications(source_id,snapshot_id,generation) VALUES (p_source,s.id,1);
  ELSE
    UPDATE public.city_parking_curb_publications SET snapshot_id=s.id,generation=generation+1,changed_at=clock_timestamp()
      WHERE source_id=p_source AND snapshot_id=p_expected_current;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pointer compare-and-set failed'; END IF;
  END IF;
  RETURN 'PUBLISHED';
END;
$guard$;

REVOKE ALL ON FUNCTION curb_private.membership_seal_v2(uuid),curb_private.assert_complete_v2(uuid),
  curb_private.expected_evidence_v2(uuid),curb_private.assert_attestation_v2(uuid) FROM PUBLIC,anon,authenticated,service_role,curb_artifact_verifier;
REVOKE ALL ON FUNCTION public.attest_city_parking_curb_snapshot_v2(uuid,uuid,jsonb),
  public.validate_city_parking_curb_snapshot(uuid,uuid,text,text,text),public.publish_city_parking_curb_snapshot(uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role,curb_artifact_verifier;
GRANT EXECUTE ON FUNCTION public.attest_city_parking_curb_snapshot_v2(uuid,uuid,jsonb),
  public.validate_city_parking_curb_snapshot(uuid,uuid,text,text,text) TO curb_artifact_verifier;
GRANT EXECUTE ON FUNCTION public.publish_city_parking_curb_snapshot(uuid,uuid,uuid) TO service_role;
COMMIT;
