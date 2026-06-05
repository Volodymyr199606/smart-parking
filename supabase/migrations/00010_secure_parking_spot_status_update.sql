-- C2: Secure parking_spots status updates.
-- Removes broad authenticated UPDATE on parking_spots (00002).
-- Clients must call update_parking_spot_status() to change status only.

DROP POLICY IF EXISTS "Authenticated users can update spot status" ON public.parking_spots;

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
