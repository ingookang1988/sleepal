# plan/meetings/ — raw deliberation that precedes a plan (append-only)

> **Position:** the *raw input* of `plan`. meeting : plan = raw : derived (same shape as `verification/`).
>   A plan is the **settled** intent; a meeting is the **un-settled deliberation** that produces it.
> **Permission:** **append-only** — never rewrite a past meeting record (human OR agent may add new ones).
>   This differs from `plan/` itself (Schema). Grouping under plan does NOT make meetings Schema.

## What goes in
- Pre-planning discussion with humans/agents: options weighed, trade-offs, open questions, who-said-what.
- The *reasoning trail* behind a plan — so the "why" survives even after the plan settles.

## What stays out
- The settled decision → `plan/PLAN-*` (the meeting *produces* a plan; it is not the plan).
- Proposed harness-rule changes → `.union-stack/proposals/`.
- Strategic project pivots → `.union-stack/project/HISTORY.md`.

## ZFS lineage sharing (the payoff)
Name a meeting with the **same lineage** as the plan it feeds: `MTG-01a_kickoff.md` ↔ `PLAN-01a`.
Then Upward Fetching on `01a` surfaces both the plan *and* the meeting that birthed it — the rationale
travels with the work automatically.

## Files
- `MTG-*` (ZFS, lineage shared with the target PLAN-*). e.g. `MTG-01a_example_kickoff.md`
