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

There are **4 migrations** to apply for the current MVP (in order):
1. `00001_initial_schema.sql` — Tables, constraints, indexes, RLS, triggers
2. `00002_allow_spot_status_update.sql` — RLS policy allowing authenticated users to update spot status
3. `00003_enable_realtime.sql` — Adds `parking_spots` to the `supabase_realtime` publication
4. `00004_waitlist_signups.sql` — Waitlist table for the marketing website (insert-only)
5. `00008_favorite_parking_spots.sql` — User favorites for parking spots (mobile app)
6. `00009_analytics_events.sql` — Append-only product analytics events (mobile app)

> **Migration `00005_city_parking_data.sql`** adds separate city tables (`city_parking_sources`, `city_parking_blocks`, `city_parking_meters`). Apply it when you want to run the ingestion prototype (`pnpm ingest:sf-parking`). It does **not** modify `parking_spots` or the mobile MVP. See [`docs/CITY_DATA_PLAN.md`](../docs/CITY_DATA_PLAN.md).

**Option A: Supabase Dashboard (recommended for first setup)**

1. In your Supabase project, go to **SQL Editor**
2. For each migration file in order (`00001`, `00002`, `00003`, `00004`):
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

For **MVP-only** databases, apply only `00001`–`00004`. Add `00005` when testing city ingest.

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
2. You should see three tables:
   - `profiles` (empty until users sign up)
   - `parking_spots` (26 rows from seed data)
   - `parking_reports` (empty until users submit reports)
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

These are loaded automatically by Expo when the app starts.

---

## Tables

| Table | Purpose |
|-------|---------|
| `profiles` | User profiles (linked to `auth.users` via id) |
| `parking_spots` | All parking spot locations and availability |
| `parking_reports` | User-submitted availability reports |
| `waitlist_signups` | Marketing-site waitlist signups (insert-only) |

### City data tables (migration `00005` — ingestion prototype)

| Table | Purpose |
|-------|---------|
| `city_parking_sources` | Registry of DataSF datasets |
| `city_parking_blocks` | Metered street blocks + regulation fields |
| `city_parking_meters` | Parking meter locations |

Populated by `pnpm ingest:sf-parking` (service role). **Legal/rule + inventory data** — not live availability. The mobile app still uses `parking_spots` for the map MVP.

**Inspection view:** `city_parking_meters_clean` (`00006`) — read-only flattened meters for SQL Editor checks. Not used by the app.

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

## Security (Row Level Security)

All tables have RLS enabled:

- **profiles** — Users can only read/update their own profile.
- **parking_spots** — Any authenticated user can read all spots. Authenticated users can update spot status (via migration 2).
- **parking_reports** — Users can insert reports (as themselves) and read their own reports.
- **waitlist_signups** — Anyone (anon + authenticated) can insert. No SELECT policy is defined, so reads are blocked for client roles. Read via the service role from the Supabase dashboard.
- **city parking tables** (`00005`) — Public read (`anon` + `authenticated`). No client write policies; ingestion uses service role only.

## Auto-Triggers

- `set_updated_at()` — Automatically updates `updated_at` on row changes for `profiles` and `parking_spots`.
- `handle_new_user()` — Automatically creates a `profiles` row when a new user signs up via Supabase Auth.

## File Structure

```
supabase/
├── migrations/
│   ├── 00001_initial_schema.sql              → Tables, constraints, indexes, RLS, triggers
│   ├── 00002_allow_spot_status_update.sql    → RLS policy for spot status updates
│   ├── 00003_enable_realtime.sql             → Realtime publication for parking_spots
│   ├── 00004_waitlist_signups.sql            → Waitlist signups table (insert-only)
│   ├── 00005_city_parking_data.sql           → City parking tables (optional; for ingest prototype)
│   ├── 00006_city_parking_views.sql            → Read-only inspection view (optional)
│   └── 00007_normalized_city_parking.sql       → Normalized city locations (Phase 2)
├── seed/
│   └── seed.sql                              → 26 mock SF parking spots
└── README.md                                 → This file
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
