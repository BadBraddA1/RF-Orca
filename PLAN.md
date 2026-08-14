# RF-Orca — Product & Build Plan

Shareable RF coordination board for live crews — a custom, lean alternative to SoundBase for the floor. Import a Shure Wireless Workbench export, lock which channels are allowed, and track which frequencies are actually deployed (and in which room).

---

## 1. Problem

RF coordinators produce a frequency plan in **Shure Wireless Workbench (WWB)**. Crews on the floor need a simple shared view that answers:

1. Which channels / frequencies are **allowed** vs **blocked**?
2. Has this frequency been **deployed** yet?
3. **Where** (which room / zone) was it deployed?

Today that usually lives in spreadsheets, radios, and verbal handoffs. RF-Orca is the crew-facing source of truth after coordination is done.

---

## 2. Users & roles

| Role | How they get in | What they can do |
|------|-----------------|------------------|
| **Anyone with the show link (crew)** | Open shared URL | **Mark view only** — tap Deploy/Deployed, set room |
| **Coordinator (admin)** | Same URL + **admin password** set at create time | Import WWB file, mark Allowed/Blocked, manage rooms, edit show settings |

**No accounts / no login system.** Access is the show link. Editing is gated by a per-show admin password chosen when the show is created. Crews never need a password.

Home page does **not** list past shows (nothing to browse or leak). Only **New Show**. After create, you’re dropped into that show’s URL; bookmark/share the link to get back.

---

## 3. Core workflow (MVP)

```text
Home → New Show
        ↓
Name the show + set admin password
        ↓
Land on show URL (mark view)
        ↓
Unlock with admin password → import WWB CSV,
mark Allowed / Blocked, set up rooms
        ↓
Share the same show URL with crews (no password)
        ↓
- Quiet **Coordinator / Tools** unlocks import + show options
- **Show options (toggles):** Deploy, Rooms, Groups, Allow/Block, Lock after deploy, Lock board for crew
- Crews use mark view: tap **Deploy** / **Deployed** and set a room (when those options are on)
- **Lock after deploy** (default on): crew cannot undo a deployed channel; coordinator still can
- **Lock board for crew**: freeze marking when the plan is set
```

### Access model (decided)

| Action | Needs |
|--------|--------|
| Create show | Home → New Show (public) |
| See mark view / deploy + room | Show URL only |
| Import, allow/block, rooms, admin edits | Show URL + admin password |
| Browse / list all shows | **Not in product** — no show library on home |

Show URLs use an unguessable `shareToken` (not a sequential id). Losing the link means losing easy access; coordinator should copy/save the URL after create. Admin password is stored hashed in the DB (never plaintext).

### Primary UI: mark view (default)

One row (or card) per imported channel, showing at least:

- Channel name
- Frequency (MHz)
- Band / type (if present in export)
- Group & channel (if present)
- Primary vs backup (if present)
- Allowed vs blocked (read-only for crew; editable only when admin unlocked)
- **Deployed** checkbox (crew — mark view)
- **Room** (text or select from show room list)
- Optional: who deployed / when (auto-stamped)

Filters: All | Allowed | Blocked | Deployed | Not deployed | By room.

**Admin unlock** (password): reveals import, Allowed/Blocked toggles, room management, and other edit controls. Without unlock, UI stays in mark view.

---

## 4. Shure Workbench import

### Recommended first format (MVP)

**WWB Inventory Report or Coordination Report → Export as CSV**

From WWB: `Reports → Inventory report` (or coordination report) → Export as CSV.

Typical coordination-report style columns (varies by WWB version / layout):

- Type
- Band
- Channel name
- Group & Channel
- Frequency

Reports are often sectioned (e.g. Primary / Backup per RF zone). The importer should:

1. Sniff delimiter and headers
2. Parse section headers when present (`Primary frequencies`, `Backup frequencies`, zone names)
3. Normalize frequency strings (`470.125`, `470.125 MHz`, etc.) to MHz
4. Preview rows before commit so the coordinator can confirm the parse

### Stretch / later formats

| Format | Notes |
|--------|--------|
| Bare frequency list (`.txt` / `.csv`) | WWB’s documented “Import Frequencies from File” list — names may be missing |
| Native `.shw` / `.cws` | XML show / coordination workspace — richer, more fragile across WWB versions |
| Generic CSV | Column mapper if headers don’t match |

**Open need:** collect 1–2 real sample exports from your shows (inventory CSV + coordination CSV) before locking the parser. Plan assumes CSV-first.

---

## 5. Data model (MVP)

All of the below lives in the **database** (one shared store per deployment). Creating or updating a show writes here so any crew device with the show link sees the same state.

```text
Show
  id, name, venue?, createdAt, shareToken
  adminPasswordHash     // set at create; unlocks edit mode
  rooms[]               // e.g. "Ballroom A", "Green Room", "Stage"

Channel (from import)
  id, showId
  name, frequencyMhz
  band?, type?, groupChannel?
  zone?, isBackup?
  status: allowed | blocked | unreviewed
  deployed: boolean
  roomId? | roomName?
  deployedAt?, deployedBy?

ImportBatch
  id, showId, filename, importedAt, rowCount
```

### Status rules

- Default on import: `unreviewed` (or `allowed` if you prefer fewer clicks — decide in build)
- **Blocked** channels cannot be marked deployed (UI prevents it; clear message)
- Changing a channel to **Blocked** after deploy → warn and optionally clear deploy / keep history
- Room required when checking Deployed (recommended)

---

## 6. Product screens (MVP)

1. **Home** — Brand + **New Show** only (no list of existing shows)
2. **New Show** — Name + **admin password** (required) → creates DB row → redirect to show URL
3. **Mark view** (default at `/s/[shareToken]`) — Deployed checkbox + room; crew-facing
4. **Admin unlock** — Enter admin password on the show; then import, Allowed/Blocked, rooms
5. **Import** (admin) — Upload WWB CSV → preview → confirm
6. **Share** — Copy show link (crew needs link only, not the password)

Mobile-first mark view: techs will use phones on the floor.

---

## 7. Technical approach (recommended)

Greenfield repo (`RF-Orca`). Suggested stack for a shareable multi-crew tool:

| Layer | Choice | Why |
|-------|--------|-----|
| App | Next.js (App Router) + TypeScript | Fast UI, API routes, easy Vercel deploy |
| **DB** | **Required — provider TBD** | Persist shows, imported channels, allowed/blocked, deploy + room state so crews share one live board |
| Realtime | Optional later (poll / SSE / Ably) | Start with refresh / short poll; add live updates if crews collide |
| **Access** | **Show link + per-show admin password** | No user accounts; home has New Show only; mark view is open on the link; password unlocks edits |
| CSV parse | Papa Parse (or similar) in browser + server validation | Preview before save |
| Deploy | Vercel | Matches crew “open a URL” workflow |

### Decided: shows live in a database

Shows are **not** local-only or file-only. Creating a show writes it to a database so:

- The WWB import, channel allow/block flags, and deploy/room state persist
- Multiple crew devices open the same show URL and see the same board
- Reopening a show later restores coordination + deploy progress (via the saved link)

**Database product/host is deferred** — wire the app to a generic data layer first; pick Postgres/Neon/Supabase/etc. when you’re ready and plug in connection details then.

### Decided: no accounts — link + admin password

- Home: **New Show** only (no show directory)
- Crews: mark view on the show URL (deploy + room)
- Coordinator: same URL, unlock with the admin password set at create time
- Admin password stored hashed; edit APIs check an unlock session after password verify

Local-only / offline-first is out of scope for MVP; MVP assumes an online shared board backed by the DB.

---

## 8. Build phases

### Phase 0 — Spec lock (this plan)

- [x] Shows stored in a database (shared across crews) — **provider TBD, decide later**
- [x] No full auth — home is New Show only; mark view via link; admin password for edits
- [ ] Confirm WWB export type crews will use (inventory CSV vs coordination CSV)
- [ ] Collect sample files
- [ ] Confirm default: import as Allowed vs Unreviewed
- [ ] Confirm room UX: free text vs predefined list
- [ ] Confirm whether backups appear on the same board

### Phase 1 — Skeleton + import

- Next.js app scaffold
- Home → New Show (name + admin password) → DB create → redirect to show URL
- Mark view as default show page (no show list anywhere)
- Admin unlock session (cookie/token after password check)
- CSV upload + parse preview (admin)
- Persist channels + show metadata to DB
- Basic channel table after import

### Phase 2 — Coordination controls

- Allowed / Blocked toggles (admin only)
- Filters and counts (allowed / blocked / deployed)
- Room list CRUD (admin)
- Deployed checkbox + room field + timestamp (mark view, no password)

### Phase 3 — Crew share

- Copy show URL (unguessable shareToken)
- Mobile layout polish for mark view
- Prevent deploy on blocked channels
- Simple “last updated” indicator

### Phase 4 — Hardening (post-MVP)

- Live multi-user updates
- Re-import / merge when WWB plan changes
- Audit log (who deployed what)
- Export back to CSV for records
- Optional `.shw` support
- Optional password reset / change admin password flow
- Optional org multi-show library (only if needed later — not MVP)

---

## 9. Success criteria (MVP done when)

1. Home only offers **New Show** (no show list)
2. Creating a show requires an **admin password** and lands on the show’s mark view URL
3. Coordinator uploads a real WWB CSV (after admin unlock) and sees correct channel names + frequencies
4. Coordinator can mark channels allowed or blocked (admin only)
5. Crew on the same link (no password) can tap Deploy/Deployed and set a room (phone-friendly)
6. Another device on the same show link sees those updates (refresh or live)
7. Blocked channels cannot be deployed
8. Board is usable on a phone

---

## 10. Out of scope for MVP

- User accounts, SSO, or org login
- A browsable library of all shows on the home page
- Running WWB coordination / scanning inside RF-Orca
- Talking to receivers over the network
- Intermod calculation / spectrum analysis
- Full device inventory management
- Native mobile apps

RF-Orca sits **after** Workbench: plan → share → deploy tracking.

---

## 11. Open questions for the team

1. Exact WWB export you use today (inventory report CSV, coordination report CSV, or something else)?
2. Should blocked channels stay visible (greyed out) or hide behind a filter default?
3. One room per frequency, or allow “also used in Room B”?
4. Do you need multiple RF zones / shows per event day?
5. Any branding / venue list that should ship baked in?
6. **Which database?** (deferred — you’ll choose later; app will assume a DB-backed show store)
7. Should **deployed** stay open to anyone with the link, or also require a light crew code later? (MVP: anyone with the link can mark deploy — decided unless you change it)

---

## 12. Immediate next step after plan approval

1. Drop 1–2 anonymized WWB CSV samples into the repo (e.g. `fixtures/wwb/`)
2. Scaffold Next.js with DB-backed shows: New Show + admin password + mark-view URL
3. Implement Phase 1 import → Phase 2 deploy board

**Demo status:** A working Next.js demo is in this repo. Without `DATABASE_URL` it uses in-memory storage (OK for local demo; add Neon/Postgres for durable multi-device on Vercel). Sample CSV at `fixtures/wwb/sample-inventory.csv`.

