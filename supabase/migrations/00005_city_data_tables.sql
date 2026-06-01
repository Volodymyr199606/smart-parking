-- =============================================================================
-- Smart Parking: City / Curb Data Tables (FUTURE — PLANNED, NOT FOR MVP YET)
-- =============================================================================
--
-- STATUS: Draft migration — do NOT apply to production Supabase until city
--         data ingestion (Edge Functions or admin scripts) is ready.
--
-- PURPOSE:
--   Store static legal/rule data from DataSF and SFMTA: parking zones, curb
--   regulations, and street sweeping schedules. This is NOT true live parking
--   availability (no citywide empty-spot feed). Live/estimated availability
--   remains on parking_spots.status and parking_reports.
--
-- INGESTION:
--   Rows will be inserted/updated later via service role (Edge Functions or
--   admin scripts). Mobile clients are read-only for these tables.
--
-- MVP SETUP:
--   Apply migrations 00001–00004 only. Skip this file until Phase 1 city import.
--   See docs/CITY_DATA_PLAN.md and supabase/README.md.
--
-- =============================================================================

-- =============================================================================
-- 1. city_data_imports
-- Audit log for DataSF / SFMTA sync runs (parent of last_import_id FKs).
-- =============================================================================

CREATE TABLE public.city_data_imports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source          text NOT NULL,
  source_dataset  text NOT NULL,
  target_table    text NOT NULL,
  status          text NOT NULL,
  triggered_by    text NOT NULL,
  schema_version  text,
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  imported_at     timestamptz,
  rows_fetched    integer NOT NULL DEFAULT 0,
  rows_inserted   integer NOT NULL DEFAULT 0,
  rows_updated    integer NOT NULL DEFAULT 0,
  rows_skipped    integer NOT NULL DEFAULT 0,
  rows_deleted    integer NOT NULL DEFAULT 0,
  error_message   text,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT city_data_imports_source_check CHECK (
    source IN ('DATASF', 'SFMTA')
  ),
  CONSTRAINT city_data_imports_status_check CHECK (
    status IN ('running', 'success', 'failed', 'partial')
  ),
  CONSTRAINT city_data_imports_triggered_by_check CHECK (
    triggered_by IN ('cron', 'manual', 'edge_function')
  ),
  CONSTRAINT city_data_imports_target_table_check CHECK (
    target_table IN ('parking_zones', 'curb_rules', 'street_sweeping_rules')
  )
);

COMMENT ON TABLE public.city_data_imports IS
  'Audit log for city open-data import runs. Not live availability data. '
  'Writes use service role only (Edge Functions / admin scripts).';

COMMENT ON COLUMN public.city_data_imports.imported_at IS
  'Batch timestamp applied to child rows on successful completion.';

CREATE INDEX idx_city_data_imports_started
  ON public.city_data_imports (started_at DESC);

CREATE INDEX idx_city_data_imports_source_dataset
  ON public.city_data_imports (source, source_dataset, started_at DESC);

CREATE INDEX idx_city_data_imports_status
  ON public.city_data_imports (status, finished_at DESC);

CREATE INDEX idx_city_data_imports_source
  ON public.city_data_imports (source);

-- =============================================================================
-- 2. parking_zones
-- Area-level rules: RPP, management districts, rate areas (not occupancy).
-- =============================================================================

CREATE TABLE public.parking_zones (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source              text NOT NULL,
  source_dataset      text NOT NULL,
  external_id         text NOT NULL,
  zone_type           text NOT NULL,
  zone_code           text NOT NULL,
  name                text,
  description         text,
  centroid_latitude   double precision,
  centroid_longitude  double precision,
  boundary_geojson    jsonb,
  is_active           boolean NOT NULL DEFAULT true,
  raw_payload         jsonb NOT NULL,
  last_import_id      uuid REFERENCES public.city_data_imports (id) ON DELETE SET NULL,
  imported_at         timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT parking_zones_source_check CHECK (
    source IN ('DATASF', 'SFMTA')
  ),
  CONSTRAINT parking_zones_zone_type_check CHECK (
    zone_type IN (
      'RPP',
      'MANAGEMENT_DISTRICT',
      'RATE_AREA',
      'CARSHARE_PRICING',
      'OTHER'
    )
  ),
  CONSTRAINT parking_zones_source_external_unique UNIQUE (source, external_id)
);

COMMENT ON TABLE public.parking_zones IS
  'City parking zones (RPP areas, districts, rate areas). Static/legal context only — '
  'does not indicate whether a space is empty. Ingestion via service role later.';

COMMENT ON COLUMN public.parking_zones.boundary_geojson IS
  'Polygon GeoJSON until PostGIS geometry column is added in a future migration.';

CREATE INDEX idx_parking_zones_type_code
  ON public.parking_zones (zone_type, zone_code);

CREATE INDEX idx_parking_zones_centroid
  ON public.parking_zones (centroid_latitude, centroid_longitude);

CREATE INDEX idx_parking_zones_imported_at
  ON public.parking_zones (imported_at DESC);

CREATE INDEX idx_parking_zones_updated_at
  ON public.parking_zones (updated_at DESC);

CREATE INDEX idx_parking_zones_source
  ON public.parking_zones (source);

CREATE INDEX idx_parking_zones_active
  ON public.parking_zones (is_active)
  WHERE is_active = true;

CREATE TRIGGER parking_zones_updated_at
  BEFORE UPDATE ON public.parking_zones
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- 3. curb_rules
-- Blockface/segment legal parking rules (not live availability).
-- =============================================================================

CREATE TABLE public.curb_rules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source              text NOT NULL,
  source_dataset      text NOT NULL,
  external_id         text NOT NULL,
  rule_category       text NOT NULL,
  regulation_type     text NOT NULL,
  agency              text,
  blockface_id        text,
  street_name         text,
  cross_street_from   text,
  cross_street_to     text,
  days_of_week        text,
  hours               text,
  hour_limit          integer,
  permit_area         text,
  parking_zone_id     uuid REFERENCES public.parking_zones (id) ON DELETE SET NULL,
  anchor_latitude     double precision,
  anchor_longitude    double precision,
  line_geojson        jsonb,
  priority            smallint NOT NULL DEFAULT 0,
  is_active           boolean NOT NULL DEFAULT true,
  raw_payload         jsonb NOT NULL,
  last_import_id      uuid REFERENCES public.city_data_imports (id) ON DELETE SET NULL,
  imported_at         timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT curb_rules_source_check CHECK (
    source IN ('DATASF', 'SFMTA')
  ),
  CONSTRAINT curb_rules_rule_category_check CHECK (
    rule_category IN ('REGULATION', 'COLOR_CURB', 'TIME_LIMITED', 'OTHER')
  ),
  CONSTRAINT curb_rules_source_external_unique UNIQUE (source, external_id)
);

COMMENT ON TABLE public.curb_rules IS
  'City curb and blockface parking regulations (time limits, RPP, loading, etc.). '
  'Static legal-rule data — NOT true live spot availability.';

COMMENT ON COLUMN public.curb_rules.line_geojson IS
  'Line GeoJSON for the regulated segment until PostGIS is enabled.';

CREATE INDEX idx_curb_rules_blockface
  ON public.curb_rules (blockface_id);

CREATE INDEX idx_curb_rules_street_name
  ON public.curb_rules (street_name);

CREATE INDEX idx_curb_rules_regulation
  ON public.curb_rules (regulation_type, rule_category);

CREATE INDEX idx_curb_rules_anchor
  ON public.curb_rules (anchor_latitude, anchor_longitude);

CREATE INDEX idx_curb_rules_parking_zone
  ON public.curb_rules (parking_zone_id);

CREATE INDEX idx_curb_rules_imported_at
  ON public.curb_rules (imported_at DESC);

CREATE INDEX idx_curb_rules_updated_at
  ON public.curb_rules (updated_at DESC);

CREATE INDEX idx_curb_rules_source
  ON public.curb_rules (source);

CREATE TRIGGER curb_rules_updated_at
  BEFORE UPDATE ON public.curb_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- 4. street_sweeping_rules
-- Recurring street-cleaning no-parking windows (not occupancy).
-- =============================================================================

CREATE TABLE public.street_sweeping_rules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source              text NOT NULL,
  source_dataset      text NOT NULL,
  external_id         text NOT NULL,
  blockface_id        text,
  street_name         text NOT NULL,
  from_street         text,
  to_street           text,
  block_side          text,
  weekday             text NOT NULL,
  start_time          time NOT NULL,
  end_time            time NOT NULL,
  weeks_of_month      text,
  anchor_latitude     double precision,
  anchor_longitude    double precision,
  line_geojson        jsonb,
  is_active           boolean NOT NULL DEFAULT true,
  raw_payload         jsonb NOT NULL,
  last_import_id      uuid REFERENCES public.city_data_imports (id) ON DELETE SET NULL,
  imported_at         timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT street_sweeping_rules_source_check CHECK (
    source IN ('DATASF', 'SFMTA')
  ),
  CONSTRAINT street_sweeping_rules_block_side_check CHECK (
    block_side IS NULL OR block_side IN ('L', 'R', 'B')
  ),
  CONSTRAINT street_sweeping_rules_source_external_unique UNIQUE (source, external_id)
);

COMMENT ON TABLE public.street_sweeping_rules IS
  'City street sweeping schedules (temporary no-parking windows). '
  'Does not indicate live spot availability — use parking_spots / parking_reports for that.';

CREATE INDEX idx_street_sweeping_rules_blockface
  ON public.street_sweeping_rules (blockface_id);

CREATE INDEX idx_street_sweeping_rules_street_side
  ON public.street_sweeping_rules (street_name, block_side);

CREATE INDEX idx_street_sweeping_rules_weekday
  ON public.street_sweeping_rules (weekday, start_time);

CREATE INDEX idx_street_sweeping_rules_anchor
  ON public.street_sweeping_rules (anchor_latitude, anchor_longitude);

CREATE INDEX idx_street_sweeping_rules_imported_at
  ON public.street_sweeping_rules (imported_at DESC);

CREATE INDEX idx_street_sweeping_rules_updated_at
  ON public.street_sweeping_rules (updated_at DESC);

CREATE INDEX idx_street_sweeping_rules_source
  ON public.street_sweeping_rules (source);

CREATE TRIGGER street_sweeping_rules_updated_at
  BEFORE UPDATE ON public.street_sweeping_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- 5. Row Level Security
-- Authenticated users: read-only. No INSERT/UPDATE/DELETE for client roles.
-- Ingestion uses service role (bypasses RLS).
-- =============================================================================

ALTER TABLE public.city_data_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parking_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curb_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.street_sweeping_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read city data imports"
  ON public.city_data_imports
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read parking zones"
  ON public.parking_zones
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read curb rules"
  ON public.curb_rules
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read street sweeping rules"
  ON public.street_sweeping_rules
  FOR SELECT
  TO authenticated
  USING (true);

-- Intentionally no INSERT, UPDATE, or DELETE policies for anon/authenticated.
-- Edge Functions and admin scripts use the service role key to write city data.
