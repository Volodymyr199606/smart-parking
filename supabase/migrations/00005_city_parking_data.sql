-- =============================================================================
-- Smart Parking: City parking data (ingestion prototype)
-- =============================================================================
--
-- Separate from public.parking_spots (MVP mock + user reports).
-- Populated by scripts/ingest-sf-parking-data.ts (service role).
--
-- Apply when ready to test city import:
--   Run after 00001–00004 in Supabase SQL Editor, or via supabase db push.
--
-- See docs/CITY_DATA_PLAN.md and supabase/README.md.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. city_parking_sources — catalog of DataSF / SFMTA datasets we import
-- -----------------------------------------------------------------------------

CREATE TABLE public.city_parking_sources (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key      text NOT NULL,
  display_name    text NOT NULL,
  provider        text NOT NULL,
  dataset_id      text NOT NULL,
  api_base_url    text NOT NULL,
  description     text,
  last_imported_at timestamptz,
  last_row_count  integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT city_parking_sources_provider_check CHECK (
    provider IN ('DATASF', 'SFMTA')
  ),
  CONSTRAINT city_parking_sources_source_key_unique UNIQUE (source_key)
);

COMMENT ON TABLE public.city_parking_sources IS
  'Registry of city open-data feeds (DataSF/SFMTA). Not live spot availability.';

CREATE TRIGGER city_parking_sources_updated_at
  BEFORE UPDATE ON public.city_parking_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_city_parking_sources_provider
  ON public.city_parking_sources (provider);

CREATE INDEX idx_city_parking_sources_updated_at
  ON public.city_parking_sources (updated_at DESC);

-- -----------------------------------------------------------------------------
-- 2. city_parking_blocks — metered street blocks + regulation summary
-- -----------------------------------------------------------------------------

CREATE TABLE public.city_parking_blocks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id         uuid NOT NULL REFERENCES public.city_parking_sources (id) ON DELETE CASCADE,
  external_id       text NOT NULL,
  blockface_id      text,
  street_name       text,
  cross_street_from text,
  cross_street_to   text,
  spaces_count      integer,
  latitude          double precision,
  longitude         double precision,
  regulation_type   text,
  agency            text,
  days_of_week      text,
  hours             text,
  hour_limit        integer,
  permit_area       text,
  raw_payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_at       timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT city_parking_blocks_source_external_unique UNIQUE (source_id, external_id)
);

COMMENT ON TABLE public.city_parking_blocks IS
  'SFMTA metered street blocks and linked parking regulation fields. Static curb/rule data only.';

COMMENT ON COLUMN public.city_parking_blocks.regulation_type IS
  'Populated from Parking Regulations dataset when blockface_id matches; not occupancy.';

CREATE INDEX idx_city_parking_blocks_blockface
  ON public.city_parking_blocks (blockface_id);

CREATE INDEX idx_city_parking_blocks_street
  ON public.city_parking_blocks (street_name);

CREATE INDEX idx_city_parking_blocks_location
  ON public.city_parking_blocks (latitude, longitude);

CREATE INDEX idx_city_parking_blocks_imported_at
  ON public.city_parking_blocks (imported_at DESC);

CREATE INDEX idx_city_parking_blocks_updated_at
  ON public.city_parking_blocks (updated_at DESC);

CREATE INDEX idx_city_parking_blocks_source
  ON public.city_parking_blocks (source_id);

CREATE TRIGGER city_parking_blocks_updated_at
  BEFORE UPDATE ON public.city_parking_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. city_parking_meters — individual parking meters (DataSF)
-- -----------------------------------------------------------------------------

CREATE TABLE public.city_parking_meters (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id           uuid NOT NULL REFERENCES public.city_parking_sources (id) ON DELETE CASCADE,
  external_id         text NOT NULL,
  post_id             text,
  blockface_id        text,
  block_id            uuid REFERENCES public.city_parking_blocks (id) ON DELETE SET NULL,
  street_name         text,
  street_num          text,
  latitude            double precision NOT NULL,
  longitude           double precision NOT NULL,
  meter_type          text,
  cap_color           text,
  on_offstreet_type   text,
  active_meter_flag   text,
  jurisdiction        text,
  raw_payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_at         timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT city_parking_meters_source_external_unique UNIQUE (source_id, external_id)
);

COMMENT ON TABLE public.city_parking_meters IS
  'Imported parking meter locations from DataSF. Does not indicate whether a space is empty.';

CREATE INDEX idx_city_parking_meters_blockface
  ON public.city_parking_meters (blockface_id);

CREATE INDEX idx_city_parking_meters_block
  ON public.city_parking_meters (block_id);

CREATE INDEX idx_city_parking_meters_location
  ON public.city_parking_meters (latitude, longitude);

CREATE INDEX idx_city_parking_meters_imported_at
  ON public.city_parking_meters (imported_at DESC);

CREATE INDEX idx_city_parking_meters_updated_at
  ON public.city_parking_meters (updated_at DESC);

CREATE INDEX idx_city_parking_meters_source
  ON public.city_parking_meters (source_id);

CREATE TRIGGER city_parking_meters_updated_at
  BEFORE UPDATE ON public.city_parking_meters
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. Row Level Security — public read; writes via service role only
-- -----------------------------------------------------------------------------

ALTER TABLE public.city_parking_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.city_parking_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.city_parking_meters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read city parking sources"
  ON public.city_parking_sources
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Public can read city parking blocks"
  ON public.city_parking_blocks
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Public can read city parking meters"
  ON public.city_parking_meters
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies for anon or authenticated.
-- scripts/ingest-sf-parking-data.ts uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).
