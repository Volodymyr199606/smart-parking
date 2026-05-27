-- Smart Parking: Enable Realtime broadcasts for parking_spots
--
-- Supabase only broadcasts postgres_changes events for tables that are added
-- to the supabase_realtime publication. Without this, the websocket connects
-- but no events fire when rows change.

ALTER PUBLICATION supabase_realtime ADD TABLE public.parking_spots;
