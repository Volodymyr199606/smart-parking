-- Smart Parking: Basic analytics events
--
-- Append-only client events for product usage tracking.
-- Does NOT modify parking_spots, favorites, or city data tables.

CREATE TABLE public.analytics_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name    text NOT NULL,
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_analytics_events_user_id
  ON public.analytics_events (user_id);

CREATE INDEX idx_analytics_events_event_name
  ON public.analytics_events (event_name);

CREATE INDEX idx_analytics_events_created_at
  ON public.analytics_events (created_at DESC);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Authenticated users may insert events tied to themselves or anonymous (null user_id).
CREATE POLICY "Authenticated users can insert analytics events"
  ON public.analytics_events
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

-- Optional: allow pre-auth telemetry with no user_id (no PII in payload).
CREATE POLICY "Anonymous users can insert null-user analytics events"
  ON public.analytics_events
  FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL);

-- No SELECT policy for anon/authenticated — read via service role / dashboard only.
