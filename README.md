# Smart Parking

Real-time street parking availability for San Francisco drivers.

---

## Project Structure

This is a TypeScript-first monorepo with the following layout:

```
smart-parking/
├── apps/
│   ├── web/           → Next.js website (landing, demo, waitlist, subscription)
│   └── mobile/        → React Native Expo app (iOS + Android)
├── packages/
│   └── shared/        → Shared TypeScript types, constants, helpers
├── supabase/
│   ├── migrations/    → SQL migration files
│   └── seed/          → Seed data for development
├── docs/
│   └── ARCHITECTURE.md → Full system design and architecture
├── archive/
│   ├── old-backend/   → Previous Java/Spring Boot backend (reference only)
│   └── old-frontend/  → Previous Next.js frontend (reference only)
└── README.md          → This file
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile App | React Native + Expo (TypeScript) |
| Website | Next.js + Tailwind CSS (TypeScript) |
| Backend | Supabase (Postgres, Auth, Realtime, Edge Functions) |
| Database | PostgreSQL + PostGIS (via Supabase) |
| Deployment | Expo EAS (mobile) + Vercel (website) + Supabase (backend) |

## Product

- **Mobile App** — The main product. Drivers use it to find available street parking in real time.
- **Website** — Marketing and subscription site. Landing page, interactive demo, waitlist, and pricing.

## Getting Started

> Dependencies and setup instructions will be added as each app is scaffolded.

For architecture details, see [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Branch

Active development happens on the `rebuild-next-supabase` branch.

## License

See [LICENSE](./LICENSE).
