# spike/ — the exploration sandbox (escape hatch OUTSIDE the governed grid)

> **Why this exists:** union-stack is plan-first, but real work sometimes needs to *try before it knows*.
> spike/ is the deliberate lane where the rules relax so throwaway experiments don't pollute the Schema plane
> or trigger the full ritual. It sits **outside the grid** on purpose.

## Relaxed rules (here, and only here)
- **No ZFS naming required** — free-form filenames (the linter does not scan spike/).
- **No Upward Fetching ritual required** — start exploring immediately.
- **No plan required** — a spike *precedes* the decision to plan.
- **Tier: Wiki · ephemeral** — may be deleted. Time-box it (e.g. a day).

## Three explicit exits (a spike must resolve — don't let it rot)
1. **Worked → promote** to a real `plan/PLAN-*` (capture the reasoning in a `plan/meetings/MTG-*`).
2. **Failed → distill** into a `reference/lessons/LSN-*` (so the dead end isn't re-explored).
3. **Worthless → discard** (delete the spike file).

## Commit hygiene
- Tag exploratory commits with a `Spike:` trailer so reviewers/gates know it's sandbox work.

## Files
- Free-form, e.g. `SPIKE-oauth_jwt.md`. (Optional: adopt a `SPK` ZFS domain later if a spike needs lineage.)
