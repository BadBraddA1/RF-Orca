# RF-Orca

Crew-facing RF board: import a Shure Wireless Workbench CSV, mark which channels are allowed, and track deployed frequencies by room.

**Live:** https://rforca.braddcorp.com

## Access model

- Home → **New Show** only (no show list)
- Create with an **admin password**
- Crews open the show link → **mark view** (deploy + room), no login
- Admin password unlocks import + allow/block

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

## Plan

See [PLAN.md](./PLAN.md).
