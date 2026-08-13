# RF-Orca

Crew-facing RF board: import a Shure Wireless Workbench CSV, mark which channels are allowed, and track deployed frequencies by room.

## Demo app

Next.js app on Vercel.

**Access model**

- Home → **New Show** only (no show list)
- Create with an **admin password**
- Crews open the show link → **mark view** (deploy + room), no login
- Admin password unlocks import + allow/block

**Storage**

- With `DATABASE_URL` (Neon/Postgres): shared persistent shows
- Without it: in-memory demo store (fine for local `next dev`; on Vercel data can reset on cold starts)

## Develop

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sample CSV: `fixtures/wwb/sample-inventory.csv`.

## Env

```bash
DATABASE_URL=postgres://...   # optional for local; required for durable multi-device demo
```

## Plan

See [PLAN.md](./PLAN.md).
