# RF Orca (Radio Frequency Orchestrator)

Crew-facing RF mark board — nickname **Orca**. After frequency coordination is done (e.g. Shure Wireless Workbench), share one link so the floor can group channels and mark what’s deployed by room.

**Live:** https://rforca.braddcorp.com · https://rf-orca.vercel.app

## Home

Compact header brand + **New show** form above the fold. Below that, **Happening now** lists shows created in the last **10 days** (name, deploy progress, age). Older shows stay in the database and remain reachable by share link — they just leave the home list.

## Access model

- Home → **New Show** + **Happening now** (shows created in the last 10 days; older ones drop off the list but are not deleted)
- Create with an **admin password**
- Crews open the show link → **mark view** (Deploy + room), no login
- Quiet **Coordinator / Tools** control unlocks import, hand-entry, groups, rooms, allow/block
- **Show options** (toggles): Deploy, Rooms, Groups, Allow/Block, **Lock after deploy**, **Lock board for crew** — turn on only what the floor needs
- Bulk status: set all **visible** (filter/group) channels to Allowed / Blocked / Unreviewed, or per group heading

**Lock after deploy** (on by default): once a channel is Deployed, crew cannot undeploy or change the room after a short **undo grace** (~8s / toast Undo). Coordinator can still change anytime with Tools unlocked.

**Lock board for crew**: freezes all crew marking for the show (handy when the plan is set).

## Floor speed features

- **Live sync** — Ably push on channel `show:{token}` (falls back to revision poll if Ably is down); Live pill in the header
- **Import preview** — Workbench CSV shows a confirm table before replacing the board
- **Search** — name / MHz jump (Enter scrolls to first match)
- **My room** focus — filter to the room you’re dressing (persists in localStorage)
- **Progress HUD** — sticky deployed count + per-group progress
- **Activity strip** — recent deploy / import / settings events
- **Conflict ping** — same frequency deployed more than once
- **Export CSV** — snapshot of the board

## Channel groups

- Group bands however you need (Vocals, IEMs, Comms, …)
- From Workbench: zones become groups when present
- By hand: add channels with an optional group, or assign/edit group per channel after unlock
- Mark view filters and sections by group

## Storage

- With `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`: durable shared shows (production)
- Without them: in-memory demo store (local only; resets on cold start)
- Schema v3: each show has a monotonic `revision` and newest-first `activity` log (capped at 40). Board mutations bump revision + append an activity event so clients can poll for live updates. Public show payloads also include frequency `conflicts` (same freq deployed in more than one place).

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
ABLY_API_KEY=…   # Ably app “RF Orca” server key (token auth via /api/ably-auth)
```

## Brand

Transparent logo assets in `public/brand/` (navy plate removed). Favicon / apple icon use the emblem mark only.

## Site chrome

Day-one chrome: `lib/site-metadata.ts`, `/opengraph-image` + `/twitter-image` (1200×630), branded `/not-found`, `/privacy`, `robots.ts`, `sitemap.ts`, Vercel Analytics.

**Per-show OG:** `/s/[token]/opengraph-image` (and twitter) renders the show name + deploy stats for link previews. Spot-check `/s/{token}/opengraph-image` after create.

## Plan

See [PLAN.md](./PLAN.md).
