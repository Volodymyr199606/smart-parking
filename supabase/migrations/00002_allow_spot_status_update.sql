-- Allow authenticated users to update parking spot status via reports.
-- Only the status column should change; other fields stay protected by app logic.

CREATE POLICY "Authenticated users can update spot status"
  ON public.parking_spots
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
