# proposals/ — the 4th permission tier (harness self-evolution) guide  ★new tier
> **Permission: Proposal — the agent writes, but it has zero effect until approved.**
> On human approval it is promoted to Schema; on rejection it is *preserved with the rejection rationale*.

## Goes in: proposed changes to harness rules (Schema) / processes. Also proposals to
##   list/retire entries in .union-stack/reference/lessons, /contracts & /tools route here.
## Two loops: the fast loop (product wiki updates) is automatic. The slow loop (rule changes) *always* passes this gate.

## Preserving rejection records is mandatory: delete them and the same proposal repeats forever.
##   When the rationale remains, the agent reads it and stops repeating (Supersession principle).
##   ⚠ Preservation alone does NOT deliver: nothing injects `proposals/` or `archive_ledger.md` into a
##   session (upward-fetch collects PLAN/FLOW/CON/ARCH/MTG+LSN only; bootstrap reads project+profile+HANDOFF).
##   So a decision that must not be re-proposed carries a `blocks:` + `reopen_when:` field ([PRO-14]),
##   and `node scripts/blocks-index.js --write` compiles those into the AGENTS.md block every session reads.
##   Rule of thumb: **most decisions carry no `blocks:`** — the field costs permanent bootstrap space,
##   so it is for the few directions that would otherwise be relitigated. See [TOOL-22].
## This proposal-decision log *is* the substance of the "harness retrospective." No separate retro doc needed.

## Publishing strategy: an external community's issues/PRs *are* the externalized proposal tier.
## Files: PRO-* . status: Proposed | Approved | Rejected (rationale required)

## ⚖️ New-pillar / new-domain proposals MUST carry a split-principle justification (anti-bloat self-discipline).
##   A pillar accretes only if it passes BOTH tests (DESIGN_RATIONALE §1.5, §8.3):
##     (a) "no system lacks X"  AND  (b) "X fits in no existing cell."
##   Failing (b) → it is an OVERLAY (tag/frontmatter), not a pillar. See [PRO-04] (a rejected pillar = the reference case).
##   Required section in any such proposal: "## Split-principle check" stating (a)/(b) explicitly.
##   Rationale: pillars must not grow faster than evidence justifies (YAGNI). `health.js` domain-utilization
##   surfaces the symptom (many unused domains = over-eager grid); this gate stops it at the source.
