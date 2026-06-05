-- =============================================================================
-- C2: Safe apply for 00010_secure_parking_spot_status_update.sql
-- Run in Supabase SQL Editor after 00001–00009.
-- Idempotent. Does not delete data. Does not alter parking_spots columns.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'parking_spots'
  ) THEN
    RAISE EXCEPTION 'Missing public.parking_spots. Apply 00001_initial_schema.sql first.';
  END IF;
END $$;

-- Remove broad client UPDATE policy from 00002.
DROP POLICY IF EXISTS "Authenticated users can update spot status" ON public.parking_spots;

-- Drop legacy function from earlier 00010 draft if present.
DROP FUNCTION IF EXISTS public.report_parking_spot(uuid, text);

CREATE OR REPLACE FUNCTION public.update_parking_spot_status(
  spot_id uuid,
  new_status text
)
RETURNS public.parking_spots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_row public.parking_spots;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF new_status NOT IN ('AVAILABLE', 'OCCUPIED', 'UNKNOWN') THEN
    RAISE EXCEPTION 'Invalid status: %', new_status;
  END IF;

  UPDATE public.parking_spots
  SET status = new_status
  WHERE id = spot_id
  RETURNING * INTO updated_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parking spot not found';
  END IF;

  RETURN updated_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_parking_spot_status(uuid, text) TO authenticated;
