# Agent notes — RF Orca

- **Stack:** Astro (SSR) on Cloudflare Workers + React islands for the mark board.
- **Local:** `~/Code/RF-Orca` · branch work on `astro` / `main` after merge.
- **Live:** https://rforca.com (Worker `rf-orca`).
- **Do not** reintroduce Next.js, OpenNext, or Vercel Analytics.
- Interactive board lives in `src/components/MarkBoard.tsx` (React island). Shell pages are Astro.
- APIs are Astro endpoints under `src/pages/api/**` — keep URL shapes stable for the board.
- Secrets: Turso + Ably via Wrangler secrets; client PostHog/Sentry via `PUBLIC_*` / `NEXT_PUBLIC_*`.
- Deploy: `npm run deploy` (`astro build` + `wrangler deploy`).
