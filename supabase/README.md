# Smart Parking — Supabase

Database migrations, seed data, and configuration for the Supabase backend.

## Tables

| Table | Purpose |
|-------|---------|
| `profiles` | User profiles (linked to `auth.users` via id) |
| `parking_spots` | All parking spot locations and availability |
| `parking_reports` | User-submitted availability reports |

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

## Security (Row Level Security)

All tables have RLS enabled:

- **profiles** — Users can only read/update their own profile.
- **parking_spots** — Any authenticated user can read all spots.
- **parking_reports** — Users can insert reports (as themselves) and read their own reports.

## Auto-Triggers

- `set_updated_at()` — Automatically updates `updated_at` on row changes for `profiles` and `parking_spots`.
- `handle_new_user()` — Automatically creates a `profiles` row when a new user signs up via Supabase Auth.

## How to Apply Migrations

### Option A: Supabase CLI (local development)

```bash
# Link to your Supabase project
npx supabase link --project-ref YOUR_PROJECT_REF

# Push migrations to remote database
npx supabase db push
```

### Option B: Supabase Dashboard (quick setup)

1. Go to your Supabase project dashboard.
2. Open the **SQL Editor**.
3. Paste the contents of `migrations/00001_initial_schema.sql`.
4. Click **Run**.

## How to Run Seed Data

After applying the migration:

### Option A: Supabase CLI

```bash
npx supabase db reset
# This applies migrations + seed automatically
```

### Option B: Supabase Dashboard

1. Open the **SQL Editor**.
2. Paste the contents of `seed/seed.sql`.
3. Click **Run**.

## Structure

```
supabase/
├── migrations/
│   └── 00001_initial_schema.sql   → Tables, constraints, indexes, RLS, triggers
├── seed/
│   └── seed.sql                   → 25 mock SF parking spots
└── README.md                      → This file
```

## Notes

- Seed data uses `source = 'MOCK'` — will be replaced with real DataSF/SFMTA data later.
- PostGIS is not enabled yet (using lat/lng columns for now). Will add when spatial queries are needed.
- No Edge Functions yet — will be added for data sync and background jobs.
