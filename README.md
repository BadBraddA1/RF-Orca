# RForca (RF Orca)

Crew-facing RF mark board — nickname **Orca**. After frequency coordination is done (e.g. Shure Wireless Workbench), share one link so the floor can group channels and mark what’s deployed by room.

**Live:** https://rforca.com · https://rforca.braddcorp.com · https://rf-orca.vercel.app

## Demo

`/demo` plays a simulated show (fake Workbench import, deploys by room, progress HUD, activity strip, frequency conflict, board lock). Nothing is written to the database. Home links **Watch a live demo**.

- Compact header brand + **New show** form above the fold. Below that, **Happening now** lists shows created in the last **10 days** (name, deploy progress, age). Older shows stay in the database and remain reachable by share link — they just leave the home list.

**Floor networks:** phones use a solid navy paint (no fixed multi-layer background), fewer font files, poll-first live sync (Ably loads after), and deferred PostHog so the board stays usable on weak venue wifi/cell. Phone board: slim sticky HUD with **Deploy next**, search icon beside Share, **?** help sheet, full-screen Tools sheet, top activity toasts, and Add to Home Screen / standalone web app meta. Band/group Filters and By group / By room / Flat stay desk-only — section open/close is per heading caret. **Keep screen on** (phone icon next to Tools) uses Wake Lock when available and a silent video fallback on iOS Safari — not a board lock.

## Access model

- Home → **New Show** + **Happening now** (shows created in the last 10 days; older ones drop off the list but are not deleted)
- Create with an **admin password**
- Crews open the show link → **mark view** (stage room + Deploy), no login
- Quiet **Coordinator / Tools** control unlocks import, hand-entry, groups, rooms. On phone the gear opens a **full-screen Tools page** (Done to return to the board) so coordinators aren’t fighting the channel list.
- **BO Lead link** — Tools → Copy BO Lead link; floor lead can undeploy and change staged rooms without the coordinator password (no Tools). Regenerate invalidates old links
- **Undo** — with Tools unlocked, header **Undo** (or ⌘Z / Ctrl+Z) reverses the last channel edit, bulk stage room, or bulk group (session stack; deletes aren’t undoable)
- **Rename show** — Tools → Show name → Rename (share link stays the same)
- **Rooms** — edit lines in Tools → Save rooms; stage channels before Deploy; renames update staged/deployed channels; remove a line to drop a room
- **Delete all channels** — Tools → Danger zone; type `DELETE CHANNELS` (keeps the show, rooms, groups, names, and share link)
- **Delete show** — Tools → Danger zone; type the show name to confirm (permanent)
- **Show options** (toggles): Deploy, Rooms, Groups on by default; **Mic rack assignments** off until you need it; **Allow/Block** parked for now; **Lock after deploy** on; **Lock after stage** on; **Lock board for crew** off
- Tools → rack presets / custom **cols × rows** + **Fill empty** (when Mic rack assignments is on)
- Schema v9: `deploy_group_name` (floor **Deploy next** group); v8 `bo_lead_token`; v7 `people` / rack fields. Channels have `assigned_to`, `in_use`, `mic_kind`, `rack_slot`
- Rack grids up to **20×20** (200 slots) so large Workbench imports fit; import grows the rack automatically

**Lock after deploy** (on by default): once a channel is Deployed, crew cannot undeploy or change the room after a short **undo grace** (~8s / toast Undo). Coordinator (Tools unlocked) or **BO Lead** can still change anytime.

**Lock after stage** (on by default): once a room is staged on a channel, crew cannot change or clear it. First stage is still open; coordinator or BO Lead can restage.

**Lock board for crew**: freezes all crew marking for the show (handy when the plan is set). BO Lead and coordinator can still mark.

## Floor speed features

- **Deploy next** — Tools → **Floor deploy group**. Phone HUD **Deploy next**: with rooms on, pick a room → full-screen green focus card (room, Handheld/Lav, Who) → **Press here** to deploy; **Hold to exit** (~0.9s) leaves without deploying. Without rooms, same focus card. Returns to the board ready for the next one.
- **Share view links** — the show URL keeps current **view / sort / My room / Filters** (`?sort=room&room=Ballroom+A&filter=staged…`). **Copy link** pastes that view for crew
- **Live sync** — Ably push on channel `show:{token}` (falls back to revision poll if Ably is down); Live pill in the header
- **Band filters** — tap **Filters** for a popup (bands / groups); summary stays on the board so you don’t scroll to change scope
- **Select → group** — unlock Tools, tap the circle on channels (or Select all in the rail); bulk **Set group / Stage room / Delete** appear in a centered one-row dock using the same custom pick menus as Stage room / Who
- **Delete frequencies** — with Tools unlocked: **Delete freq** on a channel, or select → **Delete N** in the bottom dock (confirms first)
- **List sort** — **By group**, **By room**, or **Flat**; caret to close one section; **Close all** / **Open all** for every section
- **Open on move** — staging a channel into a room (or group) auto-opens that section if it was closed
- **Prestage rooms** — pick **Stage room** on a channel before Deploy; undeploy keeps the staged room; filters **Staged** / **No room**
- **Rename channels** — with Tools unlocked, edit the channel name inline on the list
- **Groups** — save names in Tools first, then pick from a dropdown on each channel (no free-typing)
- **Who / Stage room** — matching dropdowns (portal + flip up near the page bottom); **Who** lives on **Rack** only; List keeps Stage room + Group side by side, Deploy / Spare on the name row
- **Mic rack (A2)** — when **Rooms** is on: **Rack** → pick a room → see/mark that room’s gear (Who, Handheld/Lav, Spare/In use, Deploy). **Change room** returns to the picker. Without Rooms: physical slot grid (cols×rows, Fill empty) when Mic rack assignments is on
- **List is the default board view** (Rack available when Rooms or Mic rack assignments is on) — **3-wide** on desktop (2 on tablet, 1 on phone); name + Deploy/Spare on one row; Stage room + Group side by side; no G/Ch line; Allow/Block parked for now; multi-select circles + bottom dock when Tools unlocked
- **Deploy vs Spare** — **Deploy** (pill) marks the channel live in a room; **Spare / In use** (quieter dashed toggle) is rack occupancy, not the same action
- **Audio Crew mode** — header **Audio Crew** button (desk/tablet only): fullscreen-friendly dense rack; room name + Change room sit in the top bar; phones stay on **List**. Tap **Ping** on a channel to flash it on every crew board (draw attention across tablets).
- **Change flash** — one short pulse on update, then an orange “Updated” tint stays on the latest change (no multi-flash)
- **Focus** — shared sea-bright focus rings on mark-board controls for keyboard use
- **Import preview** — Workbench **Coordination report** or Inventory CSV: imports **primary** frequencies only (skips Backup section); keeps band + names; preview then confirm
- **Search** — name / who / MHz / band jump (Enter scrolls to first match)
- **My room** focus — on **List**, same ChoiceMenu dropdown as Who / Stage room (All rooms or one room; persists in localStorage); same selection opens that room’s gear when you switch to **Rack**
- **Progress HUD** — sticky deployed + in-use + assignment counts; per-group lines hide empty groups, peek the top 4 (incomplete first), and expand with **N more**
- **Activity strip** — compact recent events in the left rail (shorter copy); search / Rack·List / sort sit at the top of the main column
- **Conflict ping** — same frequency deployed more than once
- **Export CSV** — snapshot of the board (includes `rack_slot`, `assigned_to`, `in_use`)

## Channel groups

- Group bands however you need (Vocals, IEMs, Comms, …)
- From Workbench: zones become groups when present
- By hand: add channels with an optional group, or assign/edit group per channel after unlock
- Mark view filters and sections by group

## Storage

- With `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`: durable shared shows (production)
- Without them: in-memory demo store (local only; resets on cold start)
- Schema v9: `deploy_group_name` on shows; `bo_lead_token`; `people` roster, `rack_cols` / `rack_rows`, channels have `assigned_to`, `in_use`, `mic_kind`, `rack_slot`. Each show has a monotonic `revision` and newest-first `activity` log (capped at 40). Board mutations bump revision + append an activity event so clients can poll for live updates. Public show payloads also include frequency `conflicts` (same freq deployed in more than one place).

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
NEXT_PUBLIC_SITE_URL=https://rforca.com
ABLY_API_KEY=…   # Ably app “RF Orca” server key (token auth via /api/ably-auth)

# Observability
NEXT_PUBLIC_SENTRY_DSN=…   # Sentry project rf-orca (also set SENTRY_DSN)
SENTRY_AUTH_TOKEN=…        # source maps upload on Vercel build
NEXT_PUBLIC_POSTHOG_KEY=…  # shared Default PostHog project; product super-property rf-orca
NEXT_PUBLIC_POSTHOG_HOST=https://n.braddcorp.com
NEXT_PUBLIC_POSTHOG_UI_HOST=https://us.posthog.com
```

**Sentry** — client + server + edge init (`src/instrumentation*.ts`, `sentry.*.config.ts`), `global-error` capture, tunnel `/monitoring`, no floating Report a Bug widget. Code mappings: `BadBraddA1/RF-Orca`.

**PostHog** — `posthog-js` in `instrumentation-client.ts` (`product: "rf-orca"`); optional server helper `src/lib/posthog-server.ts`. Org is still on one PostHog project (plan limit); filter by `product` until a dedicated `rf-orca` project can be created.

## Brand

Transparent logo assets in `public/brand/` (navy plate removed). Favicon / apple icon use the emblem mark only.

**Night Watch Desk** design system: `DESIGN.md` + CSS tokens in `src/app/globals.css`. Desktop mark board uses a full-width **desk** layout (left rail for progress/filters, multi-column channel grid) in the spirit of BraddCorp admin dash — phone stays single-column with a slimmer sticky HUD and Deploy next.

## Site chrome

Day-one chrome: `lib/site-metadata.ts`, `/opengraph-image` + `/twitter-image` (1200×630), branded `/not-found`, `/privacy`, `robots.ts`, `sitemap.ts`, Vercel Analytics.

**Per-show OG:** `/s/[token]/opengraph-image` (and twitter) renders the show name + deploy stats for link previews. Spot-check `/s/{token}/opengraph-image` after create.

## Plan

See [PLAN.md](./PLAN.md).
