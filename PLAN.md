# RF-Orca — Product & Build Plan

Shareable RF coordination board for live crews: import a Shure Wireless Workbench export, lock which channels are allowed, and track which frequencies are actually deployed (and in which room).

---

## 1. Problem

RF coordinators produce a frequency plan in **Shure Wireless Workbench (WWB)**. Crews on the floor need a simple shared view that answers:

1. Which channels / frequencies are **allowed** vs **blocked**?
2. Has this frequency been **deployed** yet?
3. **Where** (which room / zone) was it deployed?

Today that usually lives in spreadsheets, radios, and verbal handoffs. RF-Orca is the crew-facing source of truth after coordination is done.

---

## 2. Users & roles

| Role | Needs |
|------|--------|
| **RF coordinator** | Upload WWB file, mark channels usable / not usable, share a live link with crews |
| **Tech / A2 / RF tech** | See allowed channels, check “deployed”, set room, avoid double-booking |
| **Lead / stage manager** (optional later) | Read-only overview of what’s live per room |

MVP: one shared “show” link (no heavy auth). Optional PIN or simple login can come later.

---

## 3. Core workflow (MVP)

```text
Coordinator exports from WWB
        ↓
Upload into RF-Orca (create Show)
        ↓
Review imported channels → mark Allowed / Blocked
        ↓
Share show URL with crews
        ↓
Crew checks “I have deployed this frequency”
        + enters / selects Room
        ↓
Board updates live for everyone
```

### Primary UI: channel board

One row (or card) per imported channel, showing at least:

- Channel name
- Frequency (MHz)
- Band / type (if present in export)
- Group & channel (if present)
- Primary vs backup (if present)
- **Allowed / Blocked** control (coordinator)
- **Deployed** checkbox
- **Room** (text or select from show room list)
- Optional: who deployed / when (auto-stamped)

Filters: All | Allowed | Blocked | Deployed | Not deployed | By room.

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

```text
Show
  id, name, venue?, createdAt, shareToken
  rooms[]          // e.g. "Ballroom A", "Green Room", "Stage"

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

1. **Home** — Create show / open recent show
2. **Import** — Upload WWB CSV → preview → confirm
3. **Rooms** — Manage room list for the show
4. **Board** — Channel list with allowed/blocked + deployed + room (main crew view)
5. **Share** — Copy link (and optional PIN later)

Mobile-first board: techs will use phones on the floor.

---

## 7. Technical approach (recommended)

Greenfield repo (`RF-Orca`). Suggested stack for a shareable multi-crew tool:

| Layer | Choice | Why |
|-------|--------|-----|
| App | Next.js (App Router) + TypeScript | Fast UI, API routes, easy Vercel deploy |
| DB | Postgres (e.g. Neon) | Shows + channels + deploy state |
| Realtime | Optional later (poll / SSE / Ably) | Start with refresh / short poll; add live updates if crews collide |
| Auth | None or share link + optional PIN for MVP | Low friction for crews |
| CSV parse | Papa Parse (or similar) in browser + server validation | Preview before save |
| Deploy | Vercel | Matches crew “open a URL” workflow |

Local-only / offline-first is possible later; MVP assumes online shared board.

---

## 8. Build phases

### Phase 0 — Spec lock (this plan)

- [ ] Confirm WWB export type crews will use (inventory CSV vs coordination CSV)
- [ ] Collect sample files
- [ ] Confirm default: import as Allowed vs Unreviewed
- [ ] Confirm room UX: free text vs predefined list
- [ ] Confirm whether backups appear on the same board

### Phase 1 — Skeleton + import

- Next.js app scaffold
- Show create / open
- CSV upload + parse preview
- Persist channels to DB
- Basic channel table (read-only after import)

### Phase 2 — Coordination controls

- Allowed / Blocked toggles
- Filters and counts (allowed / blocked / deployed)
- Room list CRUD
- Deployed checkbox + room field + timestamp

### Phase 3 — Crew share

- Public (or PIN) show board URL
- Mobile layout polish
- Prevent deploy on blocked channels
- Simple “last updated” indicator

### Phase 4 — Hardening (post-MVP)

- Live multi-user updates
- Re-import / merge when WWB plan changes
- Audit log (who deployed what)
- Export back to CSV for records
- Optional `.shw` support
- Auth / org multi-show library

---

## 9. Success criteria (MVP done when)

1. Coordinator uploads a real WWB CSV and sees correct channel names + frequencies
2. Coordinator can mark channels allowed or blocked
3. Crew can check “I have deployed this frequency” and set a room
4. Another device on the same show link sees those updates (refresh or live)
5. Blocked channels cannot be deployed
6. Board is usable on a phone

---

## 10. Out of scope for MVP

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

---

## 12. Immediate next step after plan approval

1. Drop 1–2 anonymized WWB CSV samples into the repo (e.g. `fixtures/wwb/`)
2. Scaffold Next.js + DB
3. Implement Phase 1 import → Phase 2 deploy board

No application code in this PR — plan only, so the team can approve scope and file format before build.
