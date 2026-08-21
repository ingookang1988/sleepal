# project/ — Frame (boundary) + unified time-3-axis layer guide

> **Layer:** Frame (Boundary). Not a cell of the grid, but the boundary that defines "what this project is."
> **Permission:** Schema (human edits only, agent read-only) *(New docs here may be authored by the agent as `tier: draft` with no approval — zero normative force until a human promotes them. [PRO-12])*
> **Change velocity:** identity is near-immutable; the children (roadmap·history) each move at their own pace.

## Three time axes in one folder (core design)
Skimming the single `project/` folder gives you the project's past, present, and future.
But as three files in one *folder*, not one *file* — they move at different velocities, so they are split.

- **Present** → `IDENTITY_example.md` (identity: what it is, the boundary, domain vocabulary)
- **Future** → `roadmap/` (where it's heading: milestones & gates. a child of project)
- **Past** → `HISTORY.md` (where it came from, and where not to return: major turning points)

## What goes in (IDENTITY = present)
- Identity: the problem solved, reason to exist, core concept (tech-whitepaper) → the agent's boundary discriminator
- Boundary: in/out of scope / Domain vocabulary: the project's own terms → the agent's vocabulary dictionary

## What stays out
- Implementation detail, work status, changing figures → other pillars.

## roadmap/ (future) — a child of project
- Milestones (PHASE-*) · transition gates (GATE-*). The macro direction.
- roadmap is not an independent pillar but "the future extension of identity," so it lives under project.

## HISTORY.md (past) — the ledger of major turning points
- **Goes in:** project-level strategic turning points — pivots, dependency adopt/drop, architecture overhauls.
- **Difference from archive_ledger:** archive_ledger is the *tactical past* (task-level ADRs, bound to ZFS IDs).
  HISTORY is the *strategic past* (the evolution of the project's direction). HISTORY is the higher layer that
  further compresses and promotes the ledger.
- **Use:** ① read the past to understand the present project·roadmap ② anti-regression (block returning to an abandoned direction).

### HISTORY listing discipline (so anti-regression doesn't degrade into anti-progress)
1. **Fact + reason are a pair. A fact without a reason cannot be listed.**
   "Dropped A" (poison) ✗  →  "Dropped A — not for performance but a licensing issue" (context) ✓
   With the reason, the agent can judge "the license is free now, so re-evaluation is possible."
2. **A warning, not a ban.** Not "don't do this" but "this is how it went before, so *consider it*." Final call is in the present context.
3. **Limited authorship.** Major turning points only. Distinct from day-to-day work decisions (→ archive_ledger).
   Listed by a human directly, or via proposals/ (no auto-accretion — like lessons, dumping anything in is poison).

> Rule 1 is **enforced**, not just declared: `node scripts/history-linter.js` Fail-closes (exit 1) on any
> turning point whose reason cell is empty. (No-op when HISTORY.md is absent — history accretes over time.)

## How to use
- Inject IDENTITY once at session start. Reference roadmap·HISTORY when direction judgment / anti-regression is needed.

## GRANTS.md — standing Schema-edit stamps ([PRO-09])
- **Goes in:** rows granting an agent *ongoing* edit rights to a narrow Schema scope, so it can keep editing
  without re-asking each time (it cites `Approved-by: GRANT-id` and `permission-guard --strict` checks coverage).
- **Human-owned** (it is itself Schema — an agent adding its own grant would be self-authorization, blocked).
  Keep scopes minimal, record rationale, delete the row to revoke. Not a lifecycle store — just the grant list.

## Files
- `IDENTITY_example.md` — dummy (present). Replace with your real project after cloning.
- `roadmap/` — future direction (child folder).
- `HISTORY.md` — the ledger of past turning points.
- `GRANTS.md` — standing Schema-edit stamps (human-owned; empty/example in the template).
