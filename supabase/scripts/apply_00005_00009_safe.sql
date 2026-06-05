-- =============================================================================
-- Smart Parking: Safe apply for migrations 00005–00009
-- =============================================================================
-- Run in Supabase SQL Editor after 00001–00004 are applied.
-- Idempotent: safe to re-run. Does not DELETE data or ALTER parking_spots.
-- Requires: public.set_updated_at() and public.parking_spots from 00001.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'set_updated_at'
  ) THEN
    RAISE EXCEPTION 'Missing public.set_updated_at(). Apply 00001_initial_schema.sql first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'parking_spots'
  ) THEN
    RAISE EXCEPTION 'Missing public.parking_spots. Apply 00001_initial_schema.sql first.';
  END IF;
END $$;

-- =============================================================================
-- 00005_city_parking_data.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.city_parking_sources (
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

DROP TRIGGER IF EXISTS city_parking_sources_updated_at ON public.city_parking_sources;
CREATE TRIGGER city_parking_sources_updated_at
  BEFORE UPDATE ON public.city_parking_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_city_parking_sources_provider
  ON public.city_parking_sources (provider);

CREATE INDEX IF NOT EXISTS idx_city_parking_sources_updated_at
  ON public.city_parking_sources (updated_at DESC);

CREATE TABLE IF NOT EXISTS public.city_parking_blocks (
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

CREATE INDEX IF NOT EXISTS idx_city_parking_blocks_blockface
  ON public.city_parking_blocks (blockface_id);

CREATE INDEX IF NOT EXISTS idx_city_parking_blocks_street
  ON public.city_parking_blocks (street_name);

CREATE INDEX IF NOT EXISTS idx_city_parking_blocks_location
  ON public.city_parking_blocks (latitude, longitude);

CREATE INDEX IF NOT EXISTS idx_city_parking_blocks_imported_at
  ON public.city_parking_blocks (imported_at DESC);

CREATE INDEX IF NOT EXISTS idx_city_parking_blocks_updated_at
  ON public.city_parking_blocks (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_city_parking_blocks_source
  ON public.city_parking_blocks (source_id);

DROP TRIGGER IF EXISTS city_parking_blocks_updated_at ON public.city_parking_blocks;
CREATE TRIGGER city_parking_blocks_updated_at
  BEFORE UPDATE ON public.city_parking_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.city_parking_meters (
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

CREATE INDEX IF NOT EXISTS idx_city_parking_meters_blockface
  ON public.city_parking_meters (blockface_id);

CREATE INDEX IF NOT EXISTS idx_city_parking_meters_block
  ON public.city_parking_meters (block_id);

CREATE INDEX IF NOT EXISTS idx_city_parking_meters_location
  ON public.city_parking_meters (latitude, longitude);

CREATE INDEX IF NOT EXISTS idx_city_parking_meters_imported_at
  ON public.city_parking_meters (imported_at DESC);

CREATE INDEX IF NOT EXISTS idx_city_parking_meters_updated_at
  ON public.city_parking_meters (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_city_parking_meters_source
  ON public.city_parking_meters (source_id);

DROP TRIGGER IF EXISTS city_parking_meters_updated_at ON public.city_parking_meters;
CREATE TRIGGER city_parking_meters_updated_at
  BEFORE UPDATE ON public.city_parking_meters
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.city_parking_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.city_parking_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.city_parking_meters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read city parking sources" ON public.city_parking_sources;
CREATE POLICY "Public can read city parking sources"
  ON public.city_parking_sources
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Public can read city parking blocks" ON public.city_parking_blocks;
CREATE POLICY "Public can read city parking blocks"
  ON public.city_parking_blocks
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Public can read city parking meters" ON public.city_parking_meters;
CREATE POLICY "Public can read city parking meters"
  ON public.city_parking_meters
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- =============================================================================
-- 00006_city_parking_views.sql
-- =============================================================================

CREATE OR REPLACE VIEW public.city_parking_meters_clean
WITH (security_invoker = true)
AS
SELECT
  m.id AS meter_row_id,
  COALESCE(m.post_id, m.external_id) AS meter_id,
  m.active_meter_flag AS status,
  m.latitude,
  m.longitude,
  NULLIF(
    TRIM(BOTH FROM CONCAT_WS(' ', m.street_num, m.street_name)),
    ''
  ) AS location_description,
  m.imported_at AS last_ingested_at,
  s.display_name AS source_name,
  s.source_key,
  s.dataset_id AS source_dataset_id,
  m.blockface_id,
  m.meter_type,
  m.cap_color,
  m.on_offstreet_type,
  m.jurisdiction,
  m.updated_at
FROM public.city_parking_meters m
LEFT JOIN public.city_parking_sources s ON s.id = m.source_id;

COMMENT ON VIEW public.city_parking_meters_clean IS
  'Read-only inspection view over ingested DataSF parking meters. '
  'Prototype/debug use only — not connected to the mobile app or parking_spots. '
  'Does not represent live spot availability.';

COMMENT ON COLUMN public.city_parking_meters_clean.meter_id IS
  'SFMTA post_id when present, otherwise external_id from the city feed.';

COMMENT ON COLUMN public.city_parking_meters_clean.status IS
  'City active_meter_flag (e.g. active/inactive codes). Not app availability status.';

COMMENT ON COLUMN public.city_parking_meters_clean.location_description IS
  'Human-readable street location built from street_num and street_name.';

GRANT SELECT ON public.city_parking_meters_clean TO anon, authenticated;

-- =============================================================================
-- 00007_normalized_city_parking.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.normalized_parking_locations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type     text NOT NULL,
  source_id       text NOT NULL,
  latitude        double precision NOT NULL,
  longitude       double precision NOT NULL,
  address         text,
  parking_type    text NOT NULL DEFAULT 'METERED',
  time_limit      text,
  active          boolean NOT NULL DEFAULT true,
  restrictions    text,
  city            text NOT NULL DEFAULT 'San Francisco',
  raw_source      jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at  timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT normalized_parking_locations_source_unique
    UNIQUE (source_type, source_id),

  CONSTRAINT normalized_parking_locations_parking_type_check CHECK (
    parking_type IN (
      'METERED',
      'FREE',
      'LOADING_ZONE',
      'STREET_SWEEPING',
      'GARAGE',
      'UNKNOWN'
    )
  )
);

COMMENT ON TABLE public.normalized_parking_locations IS
  'Normalized city parking inventory (Phase 2). Future canonical city layer — '
  'NOT parking_spots and NOT live availability. Filled by normalize-city-parking.ts.';

COMMENT ON COLUMN public.normalized_parking_locations.source_type IS
  'Origin category, e.g. datasf_parking_meter. Used with source_id for idempotent upserts.';

COMMENT ON COLUMN public.normalized_parking_locations.source_id IS
  'Stable external id from the city feed (post_id or external_id).';

COMMENT ON COLUMN public.normalized_parking_locations.active IS
  'Whether the city marks the meter/location as active — not app spot availability.';

COMMENT ON COLUMN public.normalized_parking_locations.raw_source IS
  'Provenance metadata linking back to city_parking_meters and DataSF source registry.';

CREATE INDEX IF NOT EXISTS idx_normalized_parking_locations_location
  ON public.normalized_parking_locations (latitude, longitude);

CREATE INDEX IF NOT EXISTS idx_normalized_parking_locations_source_id
  ON public.normalized_parking_locations (source_id);

CREATE INDEX IF NOT EXISTS idx_normalized_parking_locations_city
  ON public.normalized_parking_locations (city);

CREATE INDEX IF NOT EXISTS idx_normalized_parking_locations_source_type
  ON public.normalized_parking_locations (source_type);

CREATE INDEX IF NOT EXISTS idx_normalized_parking_locations_last_synced
  ON public.normalized_parking_locations (last_synced_at DESC);

DROP TRIGGER IF EXISTS normalized_parking_locations_updated_at ON public.normalized_parking_locations;
CREATE TRIGGER normalized_parking_locations_updated_at
  BEFORE UPDATE ON public.normalized_parking_locations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.normalized_parking_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read normalized parking locations" ON public.normalized_parking_locations;
CREATE POLICY "Public can read normalized parking locations"
  ON public.normalized_parking_locations
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- =============================================================================
-- 00008_favorite_parking_spots.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.favorite_parking_spots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parking_spot_id uuid NOT NULL REFERENCES public.parking_spots(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT favorite_parking_spots_user_spot_unique
    UNIQUE (user_id, parking_spot_id)
);

CREATE INDEX IF NOT EXISTS idx_favorite_parking_spots_user_id
  ON public.favorite_parking_spots (user_id);

CREATE INDEX IF NOT EXISTS idx_favorite_parking_spots_spot_id
  ON public.favorite_parking_spots (parking_spot_id);

ALTER TABLE public.favorite_parking_spots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own favorites" ON public.favorite_parking_spots;
CREATE POLICY "Users can view own favorites"
  ON public.favorite_parking_spots
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can add own favorites" ON public.favorite_parking_spots;
CREATE POLICY "Users can add own favorites"
  ON public.favorite_parking_spots
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can remove own favorites" ON public.favorite_parking_spots;
CREATE POLICY "Users can remove own favorites"
  ON public.favorite_parking_spots
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- =============================================================================
-- 00009_analytics_events.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name    text NOT NULL,
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id
  ON public.analytics_events (user_id);

CREATE INDEX IF NOT EXISTS idx_analytics_events_event_name
  ON public.analytics_events (event_name);

CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at
  ON public.analytics_events (created_at DESC);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can insert analytics events" ON public.analytics_events;
CREATE POLICY "Authenticated users can insert analytics events"
  ON public.analytics_events
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Anonymous users can insert null-user analytics events" ON public.analytics_events;
CREATE POLICY "Anonymous users can insert null-user analytics events"
  ON public.analytics_events
  FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL);
