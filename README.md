# RF-Orca

Crew-facing RF board: import a Shure Wireless Workbench export, mark which channels are allowed, and track deployed frequencies by room.

## Status

Planning — see **[PLAN.md](./PLAN.md)** for product scope, WWB import approach, data model, and build phases.

**Decided:**

- Shows live in a **database** (provider TBD)
- **No user accounts** — home is **New Show** only (no show list)
- Create show → set an **admin password** for edits (import, allow/block)
- Default show page is the **mark view** (deploy + room); crews use the link only

## Intended MVP flow

1. Home → **New Show** (name + admin password) → get a shareable show URL
2. Unlock with admin password → upload WWB CSV → mark channels **allowed** / **blocked**
3. Share the show link with crews (no password)
4. Crew checks **I have deployed this frequency** and selects the **room**
