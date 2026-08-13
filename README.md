# RF-Orca

Crew-facing RF board: import a Shure Wireless Workbench export, mark which channels are allowed, and track deployed frequencies by room.

## Status

Planning — see **[PLAN.md](./PLAN.md)** for product scope, WWB import approach, data model, and build phases.

**Decided:** shows (channels, allow/block, deploy + room) are stored in a **database** so crews share one live board. Database provider TBD.

## Intended MVP flow

1. Upload a WWB inventory / coordination CSV → saved as a show in the DB
2. Mark channels **allowed** or **blocked**
3. Share a show link with crews
4. Crew checks **I have deployed this frequency** and selects the **room**
