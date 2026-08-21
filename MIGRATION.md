<!--
  Onboarding methodology doc (public). How to move an existing project onto union-stack.
  Not an agent-control file — agents read AGENTS.md. This is for the human doing the migration.
-->
# Migrating an existing project onto union-stack

## Two paths
- **Fresh / mostly empty repo** → run `node scripts/init.js --name "My Project" --apply` (seeds identity, strips dummies, resets manifests). Then fill in.
- **Existing doc-stack (6/7-doc, ad-hoc docs, wiki)** → map your files onto the plane using the table below, then validate with `node scripts/zfs-linter.js`.

## Mapping table (old → new home)
Copy this, fill the right column, then move files.

| Your existing artifact | union-stack home | Tier |
|---|---|---|
| project README / vision / scope / glossary | `.union-stack/project/IDENTITY*.md` | Schema |
| roadmap / milestones | `.union-stack/project/roadmap/PHASE-*` | Schema |
| strategic pivots / "why we changed direction" | `.union-stack/project/HISTORY.md` | Schema/Raw |
| architecture rules / layering / dependency norms | `.union-stack/architecture/ARCH-*` | Schema |
| deploy / DB / infra **decisions** | `.union-stack/architecture/infra/INF-*` | Schema |
| feature plans / requirements / intent | `.union-stack/plan/PLAN-*` | Schema |
| pre-plan discussion / meeting notes | `.union-stack/plan/meetings/MTG-*` | append-only |
| shared types / interfaces / test-tooling catalog | `.union-stack/reference/contracts/CON-*` | Schema |
| repeated-failure log / postmortems | `.union-stack/reference/lessons/LSN-*` | Wiki |
| domain models / formulas / theory | `.union-stack/reference/domain/DOM-*` | Schema |
| living feature map / what's shipped | `.union-stack/feature/` (live.md, flow/FLOW-*) | Wiki |
| current sprint / work orders | `.union-stack/sprint/` (next.md, WO-*/WF-*) | Wiki |
| session log / handoff | `.union-stack/sprint/HANDOFF.md` (latest), git = archive | Wiki |
| tactical decisions (ADRs) | `.union-stack/archive_ledger.md` | Raw (append) |
| CI logs / test output / drift notes | `.union-stack/verification/` (raw/ in, derived/ out) | Raw / Wiki |
| harness-rule change proposals | `.union-stack/proposals/PRO-*` | Proposal |
| throwaway experiments | `.union-stack/spike/` (no ZFS, ephemeral) | Wiki |

## Common patterns
- **flat → hierarchical**: a single big PLAN.md becomes `PLAN-01`, `PLAN-01a`, `PLAN-01a1` (ZFS lineage). Reference by bracket ID `[PLAN-01a]`, never by path.
- **monolith → decomposed**: split a 40KB+ doc by ZFS lineage; keep an index file and child nodes. See the rotation note below.
- **rename to ZFS**: `[DOMAIN]-[LUHMANN_ID]_[slug].md`; run `node scripts/zfs-linter.js` until clean.

## HISTORY 형식 — 표형과 헤딩형
`project/HISTORY.md` accepts **both** shapes, and `scripts/history-linter.js` / the dashboard time axis
count both. Pick one and keep it:

- **Table form (canonical).** `| Date | Turning point (fact) | Reason (why) | Implication |`.
  The columns *are* the contract, so a blank reason cell is a fact — the gate **REJECTs** it.
- **Heading form (natural for migrated projects).** `### YYYY-MM-DD — {title}` followed by
  `Context` / `Decision` / `Rationale` / `Impact`, as sub-headings or as `- **Rationale:** …` list rows.
  Reason labels recognised: `근거` `왜` `이유` `Reason` `Rationale` `Why`; implication labels:
  `시사점` `영향` `Impact` `Implication` `Note`.
  Free prose can't prove a reason is *absent*, so a heading entry with no reason label is **CLARIFY**
  (surfaced, never blocking) rather than REJECT.

If you migrated before this existed, your entries were silently counted as **0 turning points**. Nothing
to convert — re-run `node scripts/history-linter.js` and the count is real. To move to the table form,
one row per `###` block: date → Date, title → fact, `Rationale` → reason, `Impact` → implication.

## Adopter configuration — `.union-stack/adapter.json`
Adopters legitimately need to change how two gates behave. Declare it here instead of patching the
scripts: `scripts/*.js` is the **sync** category, so `template-update --apply` overwrites local patches.
This file is adopter-owned — upstream never touches it.

```json
{
  "private": true,
  "zfsIgnored": ["mechanism.md"]
}
```

- `private: true` — this repo holds real, non-public content. The leakage gate exists to protect the
  *public template* from real content leaking in, so in a private adopter its meaning inverts:
  `health.js` reports it as **INFO (강등)** instead of FAIL. The measured count is still printed —
  the gate itself is unchanged, only the scorecard's verdict.
- `zfsIgnored: [...]` — extra fixed manifest **filenames** (not paths) exempt from ZFS naming, merged
  with the built-in exemption list.

Unknown keys and wrong types are reported as warnings rather than silently ignored — a typo that looks
applied but isn't is the standard failure of this kind of config.

Two adopter-owned files sit next to it, and `template-update` never touches either:
`.union-stack/template-sync.json` (the last-coherent anchor — written by `--apply`, seeded by `init.js`)
and, if you add one, `scripts/dashboard.local.js` (below).

## Adopter dashboard sections — `--sections`
`scripts/dashboard.js` is a **sync** file, so forking it to add your own section loses the edit on the next
`--apply`. Ship your sections in an adopter-owned module instead:

```js
// scripts/dashboard.local.js
module.exports = [
  { id: 'kpi', title: '제품 KPI', axis: 'product',
    render: d => `<div class="meta">docs ${d.index.length} · WO ${d.wos.length}</div>` },
  { id: 'ops', title: '운영 지표', axis: 'ops', axisLabel: '운영',   // new axis id → new page + nav entry
    render: d => '…' },
];
```

```bash
node scripts/dashboard.js --sections scripts/dashboard.local.js
```

`render(gathered)` is a pure data → HTML-fragment function, the same contract the built-in sections use;
`gathered` is what `gatherAll()` returns (`index`, `health`, `budget`, `wos`, `sprint`, `time`, `product`,
`today`). The card shell (`<section>` + heading) is added by the host, and a section that throws prints the
error inside its own card — the rest of the page still renders. A module that fails to load is reported on
stderr with exit 1 (the dashboard is still written, without those sections).

## Compatibility notes (what carries over for free)
- **ZFS Luhmann IDs ↔ existing PLAN/ID lineage**: if you already number plans hierarchically, the IDs map 1:1 — no conversion needed. Existing Zettelkasten/Folgezettel users inherit lineage directly.
- **Drift/gap docs map directly**: an existing `gap.md` / drift log → `.union-stack/verification/derived/gap.md` with no reshaping.
- **3-tier permission as a role clarifier**: deciding "is this Schema or Wiki?" for each file is, in practice, a fast and clarifying way to assign each doc its role during migration.

## Large docs
union-stack files are small skeletons; real docs grow. When a doc exceeds ~30KB (`node scripts/health.js` warns), split it along its ZFS lineage and/or rotate older entries — see `DESIGN_RATIONALE.md` (§7, rotation protocol).

## Upgrading from an older union-stack
For the full per-version change list, see [`CHANGELOG.md`](./CHANGELOG.md) (entries marked **⚠** require a migration action). The one structural change so far:

Two directories were renamed for clarity (folder name now matches its meaning):

| Old (pre-v5.x) | Current | Why |
|---|---|---|
| `topology/` | `architecture/` | matches the `ARCH` domain; "architecture norms" is clearer |
| `mechanism/` | `verification/` | "mechanism" collides with "architectural mechanism"; this plane verifies |

Move the folders and update any bracket-ID/text references; IDs themselves are unchanged.

### ⚠ PRO-14 — add the re-proposal blocks marker to your AGENTS.md
`AGENTS.md` is a *review*-category file (upstream reports drift; it never overwrites yours), so this
one block must be added by hand. Paste it into the bootstrap section, then run the compiler:

```markdown
### ⛔ 재제안 차단 목록 ([PRO-14] — 결정된 것을 다시 꺼내지 마라)
<!-- blocks-index:begin — generated by `node scripts/blocks-index.js --write`; do not hand-edit -->
- (없음)
<!-- blocks-index:end -->
```

Then `node scripts/blocks-index.js --write`. Until the block exists the gate reports CLARIFY (exit 3,
non-blocking) rather than failing. **No retro-labelling** of existing ledger rows is required — the
ledger is append-only, so mark only the few decisions that must not be relitigated, in new entries.

### ⚠ PRO-15 — turn `sprint/next.md` into a generated worktable
Replace your hand-maintained active table with the marker block, then compile it from your `WO-*` docs:

```markdown
# Sprint — Active
<!-- worktable:begin — generated by `node scripts/work-close.js --table --write`; do not hand-edit -->
<!-- worktable:end -->
```

Then `node scripts/work-close.js --table --write`. Any work orders you tracked as table rows become
`sprint/WO-<id>_<slug>.md` documents whose frontmatter `status:` is the single source of truth
(`Draft → Active → Verifying → Closed`); the table is regenerated from them, so a closed WO leaves the
view by itself. Closed WOs move to `sprint/archived/` at session end and are **never deleted** — they
must stay indexed for the GC condition in `plan/_GUIDE.md` to remain computable.

Also: `Live` was removed from the lock vocabulary — search your docs for `Verifying/Live` and drop the
`Live` half. No node can have had that status (it was never indexable), so nothing unlocks in practice.

## Validate
```bash
node scripts/zfs-linter.js      # naming
node scripts/health.js          # gates + structural metrics (size, refs, domain use)
node scripts/ref-linter.js      # bracket-ID reference integrity (advisory)
node scripts/blocks-index.js    # re-proposal blocks index in sync (CLARIFY, never blocks)
node scripts/work-close.js --table   # worktable view in sync with WO docs (CLARIFY)
```
