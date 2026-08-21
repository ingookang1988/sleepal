# plan/archived/ — inert store for terminal plans (optional, scaling)

> **Why:** keep the active `plan/` root lean as plans accumulate. This is an *optional* convention —
> use it only when you have enough plans that scanning the root is painful.

## Rules
- **One-way and inert.** Move a plan here only when it is **Crystallized/terminal** (its successors are all done).
  Archived = "removed from the active working set," NOT a lifecycle stage.
- **status field stays canonical.** Do NOT treat the folder as the lifecycle signal — `status:` in frontmatter
  is the single source of truth (tooling reads it). The folder is just human-facing tidiness.
- **ZFS unchanged.** Archived plans keep their `PLAN-*` ID; bracket-ID references (`[PLAN-01a]`) still resolve
  (location is irrelevant under ZFS). They remain in the index.
- **GC still applies.** When a crystallized plan's decision is captured in `archive_ledger.md` and the grace
  period passes, GC may remove it entirely (see `plan/_GUIDE.md`).

## Files
- `PLAN-*` (terminal). Empty in the template — populate only as real plans crystallize.
