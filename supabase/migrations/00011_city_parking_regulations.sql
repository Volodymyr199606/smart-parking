-- =============================================================================
-- Smart Parking: Normalized city parking regulations (storage V1)
-- =============================================================================
--
-- Additive lossless sink for DataSF Parking Regulations (hi6h-neyh).
-- Does NOT drop or alter city_parking_blocks regulation columns.
-- Does NOT implement regulation→block association (block_id stays null).
-- Does NOT change parking_spots, legality, coverage, or mobile lookup.
--
-- Requires: 00005_city_parking_data.sql applied first.
-- See docs/CITY_REGULATION_STORAGE.md and docs/DATASF_REGULATION_JOIN.md.
-- =============================================================================

CREATE TABLE public.city_parking_regulations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id         uuid NOT NULL REFERENCES public.city_parking_sources (id) ON DELETE CASCADE,
  external_id       text NOT NULL,
  block_id          uuid REFERENCES public.city_parking_blocks (id) ON DELETE SET NULL,
  regulation_type   text,
  agency            text,
  days_of_week      text,
  hours             text,
  hour_limit        numeric,
  rpparea1          text,
  rpparea2          text,
  rpparea3          text,
  source_fid_100    text,
  raw_source        jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_at       timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT city_parking_regulations_source_external_unique
    UNIQUE (source_id, external_id)
);

COMMENT ON TABLE public.city_parking_regulations IS
  'One row per DataSF Parking Regulations (hi6h-neyh) objectid. Lossless ingest sink. '
  'block_id is nullable: no verified identifier join to city_parking_blocks exists. '
  'Not occupancy. Not a legality verdict.';

COMMENT ON COLUMN public.city_parking_regulations.source_id IS
  'FK to city_parking_sources (datasf_parking_regulations). Same uuid convention as blocks/meters.';

COMMENT ON COLUMN public.city_parking_regulations.external_id IS
  'DataSF objectid as text. Idempotent UPSERT identity with source_id. Not a block id.';

COMMENT ON COLUMN public.city_parking_regulations.block_id IS
  'Optional FK when a later verified association exists. Null for live hi6h-neyh rows today.';

COMMENT ON COLUMN public.city_parking_regulations.hour_limit IS
  'Source hrlimit as numeric so fractional values (e.g. 0.5) are not truncated. Not integer.';

COMMENT ON COLUMN public.city_parking_regulations.rpparea1 IS
  'Source rpparea1 verbatim. Not concatenated with rpparea2/rpparea3. Not interpreted.';

COMMENT ON COLUMN public.city_parking_regulations.rpparea2 IS
  'Source rpparea2 verbatim. Distinct column; no invented list semantics.';

COMMENT ON COLUMN public.city_parking_regulations.rpparea3 IS
  'Source rpparea3 verbatim. Distinct column; no invented list semantics.';

COMMENT ON COLUMN public.city_parking_regulations.source_fid_100 IS
  'Observed GIS field. Not a uniqueness key and not a join key.';

COMMENT ON COLUMN public.city_parking_regulations.raw_source IS
  'Slim source row without geometry (shape / the_geom / location).';

CREATE INDEX idx_city_parking_regulations_block
  ON public.city_parking_regulations (block_id);

CREATE INDEX idx_city_parking_regulations_source
  ON public.city_parking_regulations (source_id);

CREATE INDEX idx_city_parking_regulations_imported_at
  ON public.city_parking_regulations (imported_at DESC);

CREATE TRIGGER city_parking_regulations_updated_at
  BEFORE UPDATE ON public.city_parking_regulations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.city_parking_regulations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read city parking regulations"
  ON public.city_parking_regulations
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies for anon or authenticated.
-- scripts/ingest-sf-parking-data.ts uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).
