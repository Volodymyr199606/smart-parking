-- Smart Parking: Favorite parking spots
--
-- Lets authenticated users save parking_spots for quick access.
-- Does NOT modify parking_spots or city data tables.

CREATE TABLE public.favorite_parking_spots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parking_spot_id uuid NOT NULL REFERENCES public.parking_spots(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT favorite_parking_spots_user_spot_unique
    UNIQUE (user_id, parking_spot_id)
);

CREATE INDEX idx_favorite_parking_spots_user_id
  ON public.favorite_parking_spots (user_id);

CREATE INDEX idx_favorite_parking_spots_spot_id
  ON public.favorite_parking_spots (parking_spot_id);

ALTER TABLE public.favorite_parking_spots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own favorites"
  ON public.favorite_parking_spots
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can add own favorites"
  ON public.favorite_parking_spots
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove own favorites"
  ON public.favorite_parking_spots
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
