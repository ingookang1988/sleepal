# plan/analytics/ — evidence-based analysis that backs a plan (append-only)

> **Position:** the *raw input* of `plan`, parallel to `meetings/`. analysis : plan = raw : derived.
>   meeting (who-argued-what) ∥ analytics (what the data/root-cause says) — two **parallel** raw inputs.
>   Analysis often backs a plan with no meeting at all; that is why it is a sibling, not a child, of meetings.
> **Permission:** **append-only** — never rewrite a past analysis record (human OR agent may add new ones).
>   Grouping under plan does NOT make analytics Schema (same carve-out as meetings).

## What goes in
- Evidence-based examination that informs a decision: data analysis, feasibility, benchmarks,
  root-cause (근인) findings, cost/impact estimates — the *findings* that back a plan.
- The measurable/observable basis for the "why", so the evidence survives after the plan settles.

## What stays out
- The settled decision → `plan/PLAN-*` (the analysis *backs* a plan; it is not the plan).
- Deliberation / who-argued-what → `plan/meetings/MTG-*` (that is the other raw input).
- Ad-hoc analysis voiced inside a meeting → keep it in the `MTG-*` body; promote to `ANL-*` only
  when the analysis is independently reusable/referenced.
- Proposed harness-rule changes → `.union-stack/proposals/`. Strategic pivots → `project/HISTORY.md`.

## ZFS lineage sharing (the payoff)
Name an analysis with the **same lineage** as the plan it backs: `ANL-01a_*.md` ↔ `PLAN-01a`.
Upward Fetching on `01a` then surfaces the plan, the meeting that birthed it, *and* the analysis
that backs it — the full rationale (deliberation + evidence) travels with the work automatically.

## Files
- `ANL-*` (ZFS, lineage shared with the target PLAN-*). e.g. `ANL-01a_example_provider_usage.md`
