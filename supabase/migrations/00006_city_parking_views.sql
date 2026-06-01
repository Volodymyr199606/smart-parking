-- =============================================================================
-- Smart Parking: City parking inspection views (read-only prototype)
-- =============================================================================
--
-- Read-only views for inspecting ingested city data in Supabase SQL Editor,
-- Table Editor, or ad-hoc API queries. NOT used by the mobile MVP.
--
-- Does NOT modify public.parking_spots or any existing MVP tables.
--
-- Requires: 00005_city_parking_data.sql applied first.
-- See docs/CITY_DATA_PLAN.md.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- city_parking_meters_clean
-- Flattened meter rows for human inspection (no raw_payload blob).
-- -----------------------------------------------------------------------------

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

-- Read-only access for inspection (same audience as base city tables).
GRANT SELECT ON public.city_parking_meters_clean TO anon, authenticated;

-- Views are read-only by definition; no INSERT/UPDATE/DELETE grants.
