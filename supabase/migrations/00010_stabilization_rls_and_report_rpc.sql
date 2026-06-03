-- MVP stabilization: atomic reports + remove broad parking_spots UPDATE policy.
-- Apply after 00001–00009. Mobile calls report_parking_spot() instead of two client writes.

-- Remove policy that allowed full-row updates (00002 intent was status-only).
DROP POLICY IF EXISTS "Authenticated users can update spot status" ON public.parking_spots;

-- Single transaction: insert report + update spot status.
CREATE OR REPLACE FUNCTION public.report_parking_spot(
  p_parking_spot_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_status NOT IN ('AVAILABLE', 'OCCUPIED', 'UNKNOWN') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.parking_spots WHERE id = p_parking_spot_id) THEN
    RAISE EXCEPTION 'Parking spot not found';
  END IF;

  INSERT INTO public.parking_reports (user_id, parking_spot_id, status)
  VALUES (auth.uid(), p_parking_spot_id, p_status);

  UPDATE public.parking_spots
  SET status = p_status
  WHERE id = p_parking_spot_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.report_parking_spot(uuid, text) TO authenticated;

-- Harden signup trigger (locked search_path).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.email
  );
  RETURN NEW;
END;
$$;
