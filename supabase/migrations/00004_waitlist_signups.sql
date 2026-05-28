-- Smart Parking: Waitlist signups
--
-- Collects interest from the marketing website. Anonymous visitors can
-- submit their email; only the service role can read entries (admins use
-- the Supabase dashboard or service-role queries).

CREATE TABLE public.waitlist_signups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name   text,
  email       text NOT NULL UNIQUE,
  interest    text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_waitlist_signups_email ON public.waitlist_signups (email);

-- Enable Row Level Security
ALTER TABLE public.waitlist_signups ENABLE ROW LEVEL SECURITY;

-- Anyone (including unauthenticated visitors) can sign up
CREATE POLICY "Anyone can join waitlist"
  ON public.waitlist_signups
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- No SELECT policy is added intentionally:
-- by default, RLS denies SELECT to anon and authenticated roles.
-- Admins can read via the service role key (which bypasses RLS).
