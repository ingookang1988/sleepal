# lessons/ — time-axis learning plane (the product mistake log) guide  ★new plane
> **Position:** the *time-axis counterpart* of verification. If verification is after-the-fact
>   space-axis verification, this plane is *pre-emptive time-axis warning*.
>   **Permission:** Wiki + proposal-based lifecycle.

## Goes in: failures repeated within the same lineage (debug cases · domain pitfalls) — **repo/product-specific only**.
## Injection point: bound to Upward Fetching — loaded as a *pre-warning* on work entry.

## ⚠️ What stays out → the agent platform's cross-session memory ([ADR-11], not this plane)
- **Environment / machine / cross-repo** recurring facts and preferences — "npm crashes on this box, use node",
  "workflow push needs the gh Contents API", a tool quirk that holds across projects. Those go to the agent's
  private memory (Claude Code: `MEMORY.md` + topic files — gitignored, user-global, injected *every* session),
  NOT to a committed, lineage-scoped `LSN-*`. Two reasons: (a) **leakage** — machine/path/credential-adjacent
  facts must never land in the committed plane (a public template keeps this dummy); (b) **injection economics**
  — a fact needed on *every* task shouldn't hide in one lineage, and a lineage-only lesson shouldn't bloat
  every-session memory. Route with `node scripts/query-cli.js where <kind>` (or the MCP `where_to_record`).
- **Precedence on conflict:** the repo lesson is authoritative for *repo* facts; private memory is authoritative
  for *environment* facts. If the two ever disagree within one domain, the more-specific store wins and the
  other entry is **pruned** — never leave both to contradict (that is the dual-store failure the rule prevents).

## Unique discipline (the most dangerous pillar — unverified info gets pinned at the front of the prompt)
1. Entry bar: a single failure is not a lesson. It must be observed 2–3 times before listing.
2. Expiry: bound to a "why is this still valid" rationale. When the rationale is gone, it's a retirement candidate.
3. Scope: stays attached to its own ZFS lineage only (hints from unrelated lineages cause loss of direction).
4. Cost cap: a warning, not a narrative. One line + an ID link. Delegate detail.

## Lifecycle: instead of auto-retirement (risky) or manual (bookkeeping resurrection),
##   list/retire via agent proposal (→ .union-stack/proposals) + human approval.
## Files: LSN-* (sharing the relevant lineage ID). e.g. LSN-01a_example.md
