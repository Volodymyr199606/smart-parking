# Smart Parking — Supabase

Database migrations, seed data, and configuration for the Supabase backend.

---

## Quick Start: Connect to Supabase

Follow these steps to create a Supabase project and connect it to the app.

### Step 1: Create a Supabase Project

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **"New Project"**
3. Fill in:
   - **Name:** `smart-parking`
   - **Database Password:** (save this somewhere safe — you won't need it in the app, but keep it for admin access)
   - **Region:** Choose the closest to you (e.g. `West US` for San Francisco)
4. Click **"Create new project"**
5. Wait ~2 minutes for the project to finish provisioning

### Step 2: Get Your API Credentials

1. In your Supabase project dashboard, go to **Project Settings** → **API**
2. Copy these two values:

| Value | Where to find it | What it is |
|-------|------------------|------------|
| **Project URL** | Under "Project URL" | `https://your-project-ref.supabase.co` |
| **anon public key** | Under "Project API keys" → `anon` `public` | A long JWT string starting with `eyJ...` |

> The anon key is safe to use in client-side code. Row Level Security on the database ensures users can only access their authorized data.

### Step 3: Configure Environment Variables

Create a `.env` file in `apps/mobile/`:

```bash
cd apps/mobile
cp .env.example .env
```

Edit `apps/mobile/.env` with your real values:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...your-key-here
```

> **Never commit `.env` to git.** Only `.env.example` (with placeholder values) is committed.

### Step 4: Apply the Database Migrations

This creates the tables, indexes, RLS policies, and triggers.

There are **10 migrations** to apply for the current MVP (in order):

| # | File | Purpose |
|---|------|---------|
| 1 | `00001_initial_schema.sql` | Tables, constraints, indexes, RLS, triggers |
| 2 | `00002_allow_spot_status_update.sql` | Legacy UPDATE policy (removed by 00010) |
| 3 | `00003_enable_realtime.sql` | Adds `parking_spots` to realtime publication |
| 4 | `00004_waitlist_signups.sql` | Waitlist table (web insert-only) |
| 5 | `00005_city_parking_data.sql` | City ingest tables (optional prototype) |
| 6 | `00006_city_parking_views.sql` | City data views (optional) |
| 7 | `00007_normalized_city_parking.sql` | Normalized city locations (optional) |
| 8 | `00008_favorite_parking_spots.sql` | User favorites (mobile) |
| 9 | `00009_analytics_events.sql` | Append-only analytics (mobile) |
| 10 | `00010_secure_parking_spot_status_update.sql` | Secure status RPC; removes broad spot UPDATE |

> **City migrations (00005–00007)** are optional. See [`docs/CITY_DATA_PLAN.md`](../docs/CITY_DATA_PLAN.md). They do **not** modify `parking_spots` or the Expo Go list MVP.

**Option A: Supabase Dashboard (recommended for first setup)**

1. In your Supabase project, go to **SQL Editor**
2. For each migration file in order (`00001` through `00010`):
   - Click **"New query"**
   - Copy and paste the entire contents of the migration file
   - Click **"Run"** (or press Ctrl+Enter)
   - You should see "Success. No rows returned."

**Option B: Supabase CLI**

```bash
# Install CLI if you haven't
npm install -g supabase

# Login
npx supabase login

# Link to your project (find project ref in dashboard URL or Project Settings)
npx supabase link --project-ref YOUR_PROJECT_REF

# Push migrations (applies ALL pending files including 00005 if present — avoid for MVP)
npx supabase db push
```

Apply all **10 migrations** (`00001`–`00010`) for the full MVP. Migrations `00008`–`00010` add favorites, analytics events, and the secure status-update RPC — all required for the current mobile app. Migrations `00005`–`00007` add optional city data tables (ingest prototype, not required for Expo Go list MVP).

### City data ingestion (optional)

1. Apply `00005_city_parking_data.sql` in the SQL Editor.
2. At repo root, copy `.env.example` → `.env` and set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
3. Run:

```bash
pnpm install
pnpm ingest:sf-parking -- --limit=500    # small test batch
pnpm ingest:sf-parking                   # full import (slow)
pnpm ingest:sf-parking -- --dry-run      # no Supabase writes
```

### Step 5: Seed the Database with Mock Data

After the migration is applied:

**Option A: Supabase Dashboard**

1. Go to **SQL Editor** → **"New query"**
2. Copy and paste the contents of `supabase/seed/seed.sql`
3. Click **"Run"**
4. You should see "Success. 26 rows affected."

**Option B: Supabase CLI**

```bash
npx supabase db reset
```

### Step 6: Verify Tables

1. Go to **Table Editor** in the Supabase dashboard
2. After applying all 10 migrations you should see these tables:

| Table | Expected after seed |
|-------|---------------------|
| `profiles` | Empty until users sign up |
| `parking_spots` | 26 rows (from `seed.sql`) |
| `parking_reports` | Empty until users submit reports |
| `waitlist_signups` | Empty until website signups |
| `favorite_parking_spots` | Empty until users save favorites |
| `analytics_events` | Empty until app events fire |
| `city_parking_sources` | Empty until ingest scripts run (optional) |
| `city_parking_blocks` | Empty until ingest scripts run (optional) |
| `city_parking_meters` | Empty until ingest scripts run (optional) |
| `normalized_parking_locations` | Empty until normalize script runs (optional) |

3. Click on `parking_spots` — you should see 26 San Francisco parking spots

### Step 7: Test Authentication

1. Go to **Authentication** → **Users** in the dashboard
2. Click **"Add user"** → **"Create new user"**
3. Enter a test email and password
4. After creating, go to **Table Editor** → `profiles`
5. You should see a new row created automatically (via the `handle_new_user` trigger)

---

## Environment Variables Reference

| Variable | Required | Where Used | Description |
|----------|----------|-----------|-------------|
| `EXPO_PUBLIC_SUPABASE_URL` | Yes | `apps/mobile` | Your Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Yes | `apps/mobile` | Your Supabase anon (public) API key |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes (web) | `apps/web` | Same project URL for the website |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes (web) | `apps/web` | Same anon key for the website |
| `SUPABASE_URL` | Ingest only | root `.env` | Same project URL — for ingest scripts |
| `SUPABASE_SERVICE_ROLE_KEY` | Ingest only | root `.env` | **Service role key** — required for city data ingestion scripts. Never commit this. Never ship in client apps. |

Mobile variables are loaded automatically by Expo. Website variables are loaded by Next.js. Ingest scripts read from a `.env` file at the repository root.

---

## Tables

### Core MVP tables

| Table | Migration | Purpose |
|-------|-----------|---------|
| `profiles` | 00001 | User profiles (linked to `auth.users` via id) |
| `parking_spots` | 00001 | Parking spot locations, status, type, price |
| `parking_reports` | 00001 | User-submitted availability reports |
| `waitlist_signups` | 00004 | Marketing-site waitlist signups (insert-only) |
| `favorite_parking_spots` | 00008 | User-saved favorite spots (per-user, authenticated) |
| `analytics_events` | 00009 | Append-only product analytics events |

### City data tables (migrations `00005`–`00007` — ingest prototype, optional)

| Table | Migration | Purpose |
|-------|-----------|---------|
| `city_parking_sources` | 00005 | Registry of DataSF datasets ingested |
| `city_parking_blocks` | 00005 | SFMTA metered street blocks + regulation fields |
| `city_parking_meters` | 00005 | Parking meter point locations |
| `normalized_parking_locations` | 00007 | Canonical city inventory layer (normalized from meters) |

Populated by service-role ingestion scripts (see `scripts/`). These tables contain **parking inventory and legal/rule data** — not live occupancy or availability. The mobile app currently reads only `parking_spots` for its list and map views.

**Inspection view:** `city_parking_meters_clean` (`00006`) — read-only flattened meters for SQL Editor checks. Not used by the mobile app.

## Schema Overview

### profiles
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, references auth.users |
| full_name | text | Display name |
| email | text | User email |
| created_at | timestamptz | Auto-set |
| updated_at | timestamptz | Auto-updated via trigger |

### parking_spots
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, auto-generated |
| street_name | text | Street name (required) |
| address | text | Full address |
| latitude | double precision | GPS lat (required) |
| longitude | double precision | GPS lng (required) |
| status | text | AVAILABLE, OCCUPIED, or UNKNOWN |
| parking_type | text | METERED, FREE, LOADING_ZONE, STREET_SWEEPING, GARAGE, UNKNOWN |
| price | text | Price display (e.g. "$3.50/hr") |
| time_limit | text | Time restrictions |
| source | text | MOCK, DATASF, SFMTA, or USER_REPORT |
| updated_at | timestamptz | Auto-updated via trigger |
| created_at | timestamptz | Auto-set |

### parking_reports
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, auto-generated |
| user_id | uuid | References auth.users |
| parking_spot_id | uuid | References parking_spots |
| status | text | AVAILABLE, OCCUPIED, or UNKNOWN |
| note | text | Optional user note |
| created_at | timestamptz | Auto-set |

### waitlist_signups
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, auto-generated |
| full_name | text | Optional |
| email | text | Required, unique |
| interest | text | Optional message from the user |
| created_at | timestamptz | Auto-set |

### favorite_parking_spots (migration `00008`)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, auto-generated |
| user_id | uuid | References auth.users (CASCADE delete) |
| parking_spot_id | uuid | References parking_spots (CASCADE delete) |
| created_at | timestamptz | Auto-set |

UNIQUE constraint on `(user_id, parking_spot_id)` — no duplicate favorites.

### analytics_events (migration `00009`)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, auto-generated |
| user_id | uuid | References auth.users — nullable (pre-auth events) |
| event_name | text | e.g. `parking_spot_opened`, `directions_clicked` |
| event_payload | jsonb | Structured event metadata |
| created_at | timestamptz | Auto-set |

Append-only. No SELECT policy for client roles — read via service role / dashboard only.

## Security (Row Level Security)

All tables have RLS enabled. Client roles (anon, authenticated) can only perform the operations explicitly granted below. Everything else — including any direct UPDATE on `parking_spots` — is blocked at the database level.

| Table | anon | authenticated | service role |
|-------|------|---------------|--------------|
| `profiles` | — | Read/update own row | Full access |
| `parking_spots` | — | SELECT only | Full access |
| `parking_reports` | — | INSERT own, SELECT own | Full access |
| `waitlist_signups` | INSERT | INSERT | Full access |
| `favorite_parking_spots` | — | SELECT/INSERT/DELETE own | Full access |
| `analytics_events` | INSERT (null user_id only) | INSERT | Full access |
| City tables (`00005`–`00007`) | SELECT | SELECT | Full access (ingest) |

**Spot status updates — secure RPC only (migration `00010`):**

Migration `00010` removed the broad authenticated UPDATE policy that `00002` added. Clients must now call the `update_parking_spot_status(spot_id, new_status)` RPC function (SECURITY DEFINER) to change a spot's status. This restricts updates to the three valid status values (`AVAILABLE`, `OCCUPIED`, `UNKNOWN`) and prevents clients from writing arbitrary columns. The mobile app's `reportParkingSpot()` service calls this RPC.

**City data ingestion** always uses the **service role key** (never the anon key). The service role key must not be committed to source control and must not be shipped in client apps.

## Auto-Triggers

- `set_updated_at()` — Automatically updates `updated_at` on row changes for `profiles` and `parking_spots`.
- `handle_new_user()` — Automatically creates a `profiles` row when a new user signs up via Supabase Auth.

## File Structure

```
supabase/
├── migrations/
│   ├── 00001_initial_schema.sql                        → Core tables, RLS, triggers
│   ├── 00002_allow_spot_status_update.sql              → Legacy UPDATE policy (removed by 00010)
│   ├── 00003_enable_realtime.sql                       → Realtime publication for parking_spots
│   ├── 00004_waitlist_signups.sql                      → Website waitlist table (insert-only)
│   ├── 00005_city_parking_data.sql                     → City ingest tables (optional prototype)
│   ├── 00006_city_parking_views.sql                    → city_parking_meters_clean view (optional)
│   ├── 00007_normalized_city_parking.sql               → normalized_parking_locations table (optional)
│   ├── 00008_favorite_parking_spots.sql                → User favorites table
│   ├── 00009_analytics_events.sql                      → Analytics events table
│   └── 00010_secure_parking_spot_status_update.sql     → Secure status RPC; removes 00002 policy
├── scripts/
│   ├── apply_00005_00009_safe.sql                      → Idempotent helper for city + app migrations
│   └── apply_00010_secure_status_update_safe.sql       → Idempotent helper for migration 00010
├── seed/
│   └── seed.sql                                        → 26 mock SF parking spots
└── README.md                                           → This file
```

## Notes

- Seed data uses `source = 'MOCK'` — will be replaced with real DataSF/SFMTA data later.
- PostGIS is not enabled yet (using lat/lng columns for now). Will add when spatial queries are needed.
- No Edge Functions yet — will be added for data sync and background jobs.
- **City ingest:** apply `00005_city_parking_data.sql`, then run `pnpm ingest:sf-parking` from repo root — see [`docs/CITY_DATA_PLAN.md`](../docs/CITY_DATA_PLAN.md).

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "permission denied for table" | Make sure RLS policies were applied (run the full migration) |
| Profile not created on signup | Check that the `on_auth_user_created` trigger exists |
| "relation does not exist" | Migration hasn't been applied yet — run Step 4 |
| Empty parking_spots table | Seed data hasn't been run — run Step 5 |
| App shows "Network Error" | Check that `.env` has the correct Supabase URL |
