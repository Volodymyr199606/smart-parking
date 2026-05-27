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

## How to Run

```bash
# From the monorepo root
pnpm install

# Start the dev server
cd apps/web
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
    └── components/
        ├── Nav.tsx
        ├── Hero.tsx
        ├── Problem.tsx
        ├── Solution.tsx
        ├── Features.tsx
        ├── DemoPreview.tsx
        ├── Waitlist.tsx
        ├── About.tsx
        └── Footer.tsx
```

## Waitlist Form

The form in `Waitlist.tsx` is currently a client-side placeholder that
simulates a successful submit. Wire it up to a Supabase table or a
`/api/waitlist` route when you're ready for real signups.

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
