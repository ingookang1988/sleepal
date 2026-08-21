# plan/ — contract × action (tactical planning) guide
> **Grid:** contract (agreed) × action. **Permission:** Schema (human-owned, planning isolated). *(New docs here may be authored by the agent as `tier: draft` with no approval — zero normative force until a human promotes them. [PRO-12])*
> **Change velocity:** frequently created/destroyed — hence split from immutable norms (entropy isolation).

## Goes in: "what we agreed to do." Feature-level requirements & intent.
## Stays out: immutable norms (→ .union-stack/architecture), work tracking (→ .union-stack/sprint).
## Lifecycle (status field is the SINGLE source of truth): Draft → Active → Verifying → Crystallized.
##   The frontmatter `status:` is canonical — tooling reads it (e.g. blast-radius locks on Verifying).
##   Do NOT encode lifecycle in directories too (that would duplicate the fact → drift).
##   Crystallized is not immediate deletion. Only after every successor in the lineage is terminal and a
##   grace period passes does GC crystallize the decision into archive_ledger and remove the plan (GC guard).
## Scaling (optional): when active plans pile up, move Crystallized/terminal plans into `archived/`
##   (a one-way, inert store — no status drift since archived = removed from the active set). The active
##   plan/ root stays lean; archived plans keep their ZFS ID and remain indexed. See `archived/_GUIDE.md`.
## Files: PLAN-* (ZFS). Layer planning via parent-child relations.

## Subfolders — the two raw inputs that precede a plan (both append-only, not Schema)
- `meetings/` holds `MTG-*`: pre-planning *deliberation* (who-argued-what), lineage-shared with the PLAN.
- `analytics/` holds `ANL-*`: evidence-based *analysis* (what the data/root-cause says) that backs the PLAN.
- meeting ∥ analytics : plan = raw : derived. Deliberation and analysis are **parallel** raw inputs, not
  nested — analysis often backs a plan with no meeting. See `meetings/_GUIDE.md`, `analytics/_GUIDE.md`.
