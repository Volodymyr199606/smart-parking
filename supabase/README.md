# Smart Parking — Supabase

Database migrations, seed data, and Supabase configuration.

## Structure

```
supabase/
├── migrations/    → SQL migration files (schema changes)
├── seed/          → Seed data for local development
└── README.md      → This file
```

## Database

- PostgreSQL with PostGIS extension (geospatial queries)
- Row Level Security (RLS) on all tables
- Supabase Auth for user management
- Supabase Realtime for live parking updates

## Tables

- `profiles` — User profiles (linked to auth.users)
- `parking_spots` — Parking spot locations and availability
- `favorites` — User-saved spots
- `availability_reports` — Community-reported spot status
- `waitlist` — Email signups from the website

## Usage

```bash
# Link to your Supabase project
npx supabase link --project-ref YOUR_PROJECT_REF

# Run migrations
npx supabase db push

# Seed local database
npx supabase db reset
```

## Status

Not yet configured. Migrations and seed data will be added in Phase 1.
