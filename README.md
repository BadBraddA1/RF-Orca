# RF Orca (Radio Frequency Orchestrator)

Crew-facing RF board — nickname **Orca**. Import a Shure Wireless Workbench CSV **or** add channels by hand, organize them into **channel groups**, mark allowed/blocked, and track deployed frequencies by room.

**Live:** https://rforca.braddcorp.com (DNS may still be pending) · https://rf-orca.vercel.app

## Access model

- Home → **New Show** only (no show list)
- Create with an **admin password**
- Crews open the show link → **mark view** (deploy + room), no login
- Quiet **Coordinator / Tools** control unlocks import, hand-entry, groups, rooms, allow/block
- Bulk status: set all **visible** (filter/group) channels to Allowed / Blocked / Unreviewed, or per group heading

## Channel groups

- Group bands however you need (Vocals, IEMs, Comms, …)
- From Workbench: zones become groups when present
- By hand: add channels with an optional group, or assign/edit group per channel after unlock
- Mark view filters and sections by group

## Storage

- With `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`: durable shared shows (production)
- Without them: in-memory demo store (local only; resets on cold start)

## Develop

```bash
npm install
cp .env.example .env.local   # fill Turso URL + token
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sample CSV: `fixtures/wwb/sample-inventory.csv`.

## Env

```bash
TURSO_DATABASE_URL=libsql://rf-orca-….turso.io
TURSO_AUTH_TOKEN=…
NEXT_PUBLIC_SITE_URL=https://rforca.braddcorp.com
```

## Brand

Transparent logo assets in `public/brand/` (navy plate removed). Favicon / apple icon use the emblem mark only.

## Site chrome

Day-one chrome: `lib/site-metadata.ts`, `/opengraph-image` + `/twitter-image` (1200×630), branded `/not-found`, `/privacy`, `robots.ts`, `sitemap.ts`, Vercel Analytics. Spot-check `/opengraph-image` and a bogus URL after deploy.

## Plan

See [PLAN.md](./PLAN.md).
