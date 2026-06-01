-- =============================================================================
-- Smart Parking: Normalized city parking locations (Phase 2)
-- =============================================================================
--
-- Canonical city-data layer — separate from public.parking_spots (MVP).
-- Populated by scripts/normalize-city-parking.ts from city_parking_meters.
--
-- Does NOT modify parking_spots, parking_reports, or the mobile app.
--
-- Requires: 00005_city_parking_data.sql applied first.
-- See docs/CITY_DATA_PLAN.md.
-- =============================================================================

CREATE TABLE public.normalized_parking_locations (
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

CREATE INDEX idx_normalized_parking_locations_location
  ON public.normalized_parking_locations (latitude, longitude);

CREATE INDEX idx_normalized_parking_locations_source_id
  ON public.normalized_parking_locations (source_id);

CREATE INDEX idx_normalized_parking_locations_city
  ON public.normalized_parking_locations (city);

CREATE INDEX idx_normalized_parking_locations_source_type
  ON public.normalized_parking_locations (source_type);

CREATE INDEX idx_normalized_parking_locations_last_synced
  ON public.normalized_parking_locations (last_synced_at DESC);

CREATE TRIGGER normalized_parking_locations_updated_at
  BEFORE UPDATE ON public.normalized_parking_locations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- RLS: public read for inspection; writes via service role only.
ALTER TABLE public.normalized_parking_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read normalized parking locations"
  ON public.normalized_parking_locations
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies for anon or authenticated.
