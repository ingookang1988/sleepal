# contracts/ — contract × state (shared contracts · reusable assets) guide  ★new plane
> **Grid:** contract (agreed) × state. **Permission:** Schema (contracts are pinned hard).
> **Change velocity:** near-immutable. **Reason for existence: enforce reuse — "find and use, don't recreate."**

## What goes in (two kinds, both "state-side contracts")
1. Shared static specs: global types · interfaces · enums · core signatures (SSOT).
2. Test-tooling catalog (tier 2): the *calling conventions* of runners · fixtures · mocks.

> **Boundary with `reference/tools/` ([PRO-08]).** Contracts hold *static specs* — the shape a caller must
> match (types, signatures, calling conventions). `tools/` holds the *usage contract of an executable asset*
> — when to run it, when not to, how to invoke it. A test runner's fixture signature → here; "run this
> script before X, it fail-closes on Y" → a `TOOL-*` card.

## The catalog's 3 mandatory elements (missing any one and it doesn't work)
- What exists (existence) · where it is (path/ID) · **how to use it (call example)**.

## Boundary with `feature/flow/` — "what breaks when it changes?" ([PRO-16])
> If only the *observation* goes stale (docs drift) → `FLOW-*`, Wiki tier.
> If **code on both sides breaks** → **here (CON), Schema tier, approval required.**

A `FLOW-*` lineage table records how a payload *currently flows* UI→BE→DB. The *promise* that both
sides compile against is a contract and lives here; `FLOW-*` references it by bracket ID. A contract
an agent can silently edit is not a stabilizer — it is documentation.

## `consumers:` — the off-lineage edge ([PRO-16])
Every other plane decomposes as a tree, and ZFS lineage arithmetic expresses that. A contract is by
definition shared between parties that are *not* in a containment relation (FE and BE are siblings),
so its consumers always live in other lineages — invisible to lineage-only impact analysis.
Declare them so `blast-radius` can see them:
```yaml
consumers: [FLOW-01a, FLOW-07b, FLOW-09c]   # (example) FE · BE · DB
```
- `blast-radius` unions the declared consumers **and their descendants** into the impact set, and the
  Verifying lock check runs over that union — a locked consumer now Fail-closes a contract change.
- Declare **one direction only** (contract → consumer). Two directions means two sources of truth.
- Unresolved entries are surfaced as typos (same logic as `ref-linter`'s bracket resolution).

## Sync: auto-extract from code where possible (code = truth, catalog = projection).
##   For unstructured cases, agent proposes (→ .union-stack/proposals), then human approves.
## Visibility: coordinates + bootstrap, not a forced gate — the problem is visibility, not willpower.
## Publishing caution: structure is fine to publish, but sanitize real call examples to dummies (block leakage).
