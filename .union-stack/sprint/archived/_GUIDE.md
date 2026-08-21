# sprint/archived/ — inert store for closed work orders ([PRO-15])

> **Why:** keep the active `sprint/` root lean as work orders accumulate. Same shape as
> `plan/archived/` — this is tidiness, not a lifecycle stage.

## Rules
- **One-way and inert.** Move a WO here only when `status: Closed` and `work-close` reports PASS.
- **When:** at **session end** (batch), not the moment a WO closes — mid-session moves churn the diff
  for no reader. The next `--table --write` reflects it either way (the view reads `status:`, not location).
- **status field stays canonical.** Do NOT treat the folder as the lifecycle signal — `status:` in
  frontmatter is the single source of truth. Closed WOs drop out of the worktable view by status alone.
- **ZFS unchanged.** Archived WOs keep their `WO-*` ID and stay indexed, so `blast-radius` still sees them
  and `plan/_GUIDE`'s GC condition ("every successor in the lineage is terminal") stays computable.
  That computability is the whole point of keeping them — do not delete.

## Files
- `WO-*` (Closed). Empty in the template — populate only as real work orders close.
