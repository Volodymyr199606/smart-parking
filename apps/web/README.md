# Smart Parking — Website

Next.js marketing website for Smart Parking. Landing page, demo preview, and waitlist signup.

## Purpose

The website is **not** the main product — it's a marketing surface for the
mobile app. Use it to:

- Explain what Smart Parking does
- Show a preview of the mobile experience
- Collect waitlist signups for early access

## Tech Stack

- Next.js 15 (App Router)
- React 19
- TypeScript 5
- Tailwind CSS 4 (CSS-first theme via `@theme`)
- `lucide-react` for icons

## Sections

| Section | Component |
|---------|-----------|
| Top nav | `Nav` |
| Hero | `Hero` |
| Problem | `Problem` |
| Solution | `Solution` |
| Features | `Features` |
| Demo preview | `DemoPreview` |
| Waitlist / pricing | `Waitlist` |
| About | `About` |
| Footer | `Footer` |

## Required Environment Variables

Create `apps/web/.env.local` (preferred) or `.env`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key-here
```

Get these from: Supabase Dashboard → Project Settings → API.

The website uses these to write waitlist signups to the
`waitlist_signups` table. Without them, the form will show a friendly
"temporarily unavailable" error.

## How to Run

```bash
# From the monorepo root
pnpm install

# Set up env (one time)
cd apps/web
cp .env.example .env.local
# edit .env.local with your Supabase credentials

# Start the dev server
pnpm dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Production Build

```bash
pnpm build
pnpm start
```

## Folder Structure

```
apps/web/
├── next.config.ts          → Next.js config
├── postcss.config.mjs      → Tailwind 4 PostCSS plugin
├── tsconfig.json           → TypeScript config
├── package.json            → Dependencies and scripts
└── src/
    ├── app/
    │   ├── layout.tsx      → Root layout + metadata
    │   ├── page.tsx        → Landing page composition
    │   └── globals.css     → Tailwind import + theme tokens
    ├── components/
    │   ├── Nav.tsx
    │   ├── Hero.tsx
    │   ├── Problem.tsx
    │   ├── Solution.tsx
    │   ├── Features.tsx
    │   ├── DemoPreview.tsx
    │   ├── PhoneDemo.tsx
    │   ├── Waitlist.tsx
    │   ├── About.tsx
    │   └── Footer.tsx
    └── lib/
        └── supabase.ts        → Browser-safe Supabase client
```

You'll also need a `.env.local` (gitignored) with your Supabase
credentials. See `.env.example` for the template.

## Waitlist Form

The form in `Waitlist.tsx` writes directly to the Supabase
`waitlist_signups` table via `src/lib/supabase.ts` (browser-safe anon
key, RLS-protected insert-only access).

**Fields:**
- Full name (optional)
- Email (required, must include `@`)
- What interests you most? (optional)

**States handled:**
- `idle` — fresh form
- `submitting` — request in flight
- `success` — first-time signup
- `already` — email already on the list (treated as success UX)
- `error` — invalid email, missing config, or network error

**To read signups:** use the Supabase dashboard's Table Editor with the
service role (anon clients have no SELECT policy by design).

## Design System

- Brand color: `--color-brand-600` = `#16a34a` (clean professional green)
- Background: white / `slate-50`
- Text: `slate-900` / `slate-600` / `slate-500`
- Borders: `slate-100` / `slate-200`
- Rounded corners (`rounded-2xl`, `rounded-3xl`)
- No gradients beyond very subtle accents
- Generous whitespace
- Mobile-first responsive layouts

## Deployment

Designed to deploy to Vercel out of the box:

1. Connect the repo on [vercel.com](https://vercel.com)
2. Set the **root directory** to `apps/web`
3. Build command: `pnpm build` (auto-detected)
4. Output: `.next` (auto-detected)
5. Add the two env vars under **Settings → Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
