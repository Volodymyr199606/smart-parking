-- Smart Parking: Initial Database Schema
-- This migration creates the core tables for the parking app.

-- =============================================================================
-- 1. UTILITY: updated_at trigger function
-- Automatically sets updated_at = now() on any row update.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- 2. PROFILES TABLE
-- Public user profiles linked to Supabase auth.users.
-- Created automatically via trigger when a new user signs up.
-- =============================================================================

CREATE TABLE public.profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  text,
  email      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at on row change
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- RLS: enable row level security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policy: users can read their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Policy: users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id);


-- =============================================================================
-- 3. AUTO-CREATE PROFILE ON SIGNUP
-- When a new user signs up via Supabase Auth, create a profiles row.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- =============================================================================
-- 4. PARKING_SPOTS TABLE
-- All parking spots (from mock data, DataSF, SFMTA, or user reports).
-- =============================================================================

CREATE TABLE public.parking_spots (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  street_name  text NOT NULL,
  address      text,
  latitude     double precision NOT NULL,
  longitude    double precision NOT NULL,
  status       text NOT NULL,
  parking_type text NOT NULL,
  price        text,
  time_limit   text,
  source       text NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),

  -- Allowed values for status
  CONSTRAINT parking_spots_status_check CHECK (
    status IN ('AVAILABLE', 'OCCUPIED', 'UNKNOWN')
  ),

  -- Allowed values for parking_type
  CONSTRAINT parking_spots_type_check CHECK (
    parking_type IN ('METERED', 'FREE', 'LOADING_ZONE', 'STREET_SWEEPING', 'GARAGE', 'UNKNOWN')
  ),

  -- Allowed values for source
  CONSTRAINT parking_spots_source_check CHECK (
    source IN ('MOCK', 'DATASF', 'SFMTA', 'USER_REPORT')
  )
);

-- Auto-update updated_at on row change
CREATE TRIGGER parking_spots_updated_at
  BEFORE UPDATE ON public.parking_spots
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Indexes for common queries
CREATE INDEX idx_parking_spots_location ON public.parking_spots (latitude, longitude);
CREATE INDEX idx_parking_spots_status ON public.parking_spots (status);
CREATE INDEX idx_parking_spots_updated_at ON public.parking_spots (updated_at);

-- RLS: enable row level security
ALTER TABLE public.parking_spots ENABLE ROW LEVEL SECURITY;

-- Policy: any authenticated user can read all parking spots
CREATE POLICY "Authenticated users can view spots"
  ON public.parking_spots
  FOR SELECT
  TO authenticated
  USING (true);


-- =============================================================================
-- 5. PARKING_REPORTS TABLE
-- User-submitted reports about a parking spot's current status.
-- =============================================================================

CREATE TABLE public.parking_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parking_spot_id uuid NOT NULL REFERENCES public.parking_spots(id) ON DELETE CASCADE,
  status          text NOT NULL,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Allowed values for reported status
  CONSTRAINT parking_reports_status_check CHECK (
    status IN ('AVAILABLE', 'OCCUPIED', 'UNKNOWN')
  )
);

-- Indexes for common queries
CREATE INDEX idx_parking_reports_user_id ON public.parking_reports (user_id);
CREATE INDEX idx_parking_reports_spot_id ON public.parking_reports (parking_spot_id);

-- RLS: enable row level security
ALTER TABLE public.parking_reports ENABLE ROW LEVEL SECURITY;

-- Policy: authenticated users can submit reports
CREATE POLICY "Authenticated users can insert reports"
  ON public.parking_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy: users can read their own reports
CREATE POLICY "Users can view own reports"
  ON public.parking_reports
  FOR SELECT
  USING (auth.uid() = user_id);
