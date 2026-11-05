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
| roadmap / milestones / strategy & strategic initiatives | `.union-stack/project/roadmap/PHASE-*` | Schema |
| strategic pivots / "why we changed direction" | `.union-stack/project/HISTORY.md` | Schema/Raw |
| architecture rules / layering / dependency norms | `.union-stack/architecture/ARCH-*` | Schema |
| governance / charter / policies / code of conduct / working-group structure | `.union-stack/architecture/ARCH-*` (process norms) | Schema |
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

## Adopting without `template-update` — the kit
If your copy was ported by hand (no `scripts/template-update.js`, no `.union-stack/template-sync.json`), fetch one dependency-free file and run it
from the repo root — **the first run only prints a plan**:

```bash
curl -fsSL https://raw.githubusercontent.com/ingookang1988/union-stack/main/scripts/union-stack-kit.js -o scripts/union-stack-kit.js
node scripts/union-stack-kit.js            # dry-run
node scripts/union-stack-kit.js --apply    # fetches the 8 files template-update needs (only the ones you lack) and seeds the anchor
node scripts/template-update.js            # then the normal path: report → --apply
```

The anchor is labelled `clone@<version>(추정)` and records as "in sync" **only files that are byte-identical to upstream** (at the guessed clone tag,
default `v<your CHANGELOG version>`, or at `main`). Everything else stays *unknown*, so `template-update --apply` will not overwrite it until you
decide per file with `--force <path>`. Files you already have are never touched by the kit. (`template-update --seed <ref>` is the explicit
alternative: it marks *all* local files as in sync — use it only when you are sure nothing was modified.)

## Adopter configuration — `.union-stack/adapter.json`
Adopters legitimately need to change how two gates behave. Declare it here instead of patching the
scripts: `scripts/*.js` is the **sync** category, so `template-update --apply` overwrites local patches.
This file is adopter-owned — upstream never touches it.

```json
{
  "private": true,
  "zfsIgnored": ["mechanism.md"],
  "statusMap": { "Done": "Closed", "Review": "Verifying" },
  "evidenceFields": { "evidence": ["implementation_commit"], "closed_by": ["surfaces"] },
  "lineage": { "arithmeticFrom": 36 }
}
```

- `private: true` — this repo holds real, non-public content. The leakage gate exists to protect the
  *public template* from real content leaking in, so in a private adopter its meaning inverts:
  `health.js` reports it as **INFO (강등)** instead of FAIL. The measured count is still printed —
  the gate itself is unchanged, only the scorecard's verdict.
- `zfsIgnored: [...]` — extra fixed manifest **filenames** (not paths) exempt from ZFS naming, merged
  with the built-in exemption list.
- `statusMap: { local: upstream }` — your own status vocabulary (`Done`, `Review`, …) read **as** the
  upstream one by `zfs_index` and `work-close` (so locks, the worktable, health and the roadmap view all
  follow). Values not in the map pass through unchanged — nothing is enforced; the original is kept as
  `rawStatus`. (PRO-27 ②)
- `evidenceFields: { evidence: [...], closed_by: [...] }` — local aliases for the two closure fields.
  The upstream field wins when present; aliases are tried in order.
- `lineage.arithmeticFrom: N` — ID arithmetic (`WO-01a1-2` → `01a1` → `01a` → `01`) is applied only to IDs
  whose leading number is ≥ N; below it, only frontmatter `parent:` / `plan:` counts. Declare this when a
  legacy range numbers each domain independently (`PLAN-12` and `PRO-12` unrelated), otherwise
  `upward-fetch` inherits unrelated documents. Default 0 = arithmetic everywhere. Frontmatter parents are
  **always** read in addition to arithmetic (PRO-27 ③): `parent:` and `plan:` accept a scalar, an inline
  list or a block list, may point at any domain (an umbrella WO or a mid-level PLAN is a valid root), and are
  followed transitively by `upward-fetch`, `blast-radius` (declared children are in the blast set, locks
  included) and the roadmap-wiring observation.
- `checks: [...]` — your product checks (PRO-22): `{ name, cmd, blocking, runs_on, covers, kind, env, cost, expected_zero_unless }`.
  `node scripts/ci.js` runs them after the harness chain and appends one **receipt** line per check to
  `.union-stack/verification/raw/receipts.md` (runner-only; nobody types receipts). A check that saw
  **zero targets is a failure** for a blocking full scan; `kind: 메타` / `expected_zero_unless: diff` make it a
  NOOP_PASS, `expected_zero_unless: env` a CLARIFY. `node scripts/ci.js --scan` drafts the declarations from
  `package.json` scripts, hooks and workflows; you confirm `blocking` and `cost`. `health` shows the latest
  receipt age per blocking check; `work-close` asks WO evidence to cite `rcpt:<name>@<sha>` (new WOs only).
  `checks[].known_failures: [{ id, reason, owner, until }]` registers a tolerated exception with an owner and an
  expiry: `scripts/weakening-guard.js` (in the CI chain) lets the exception list grow only by entries whose `id`
  appears in the added lines, and turns **red** when an entry expires. Weakening signals (deleted test files,
  added skips, fewer assertions, snapshot field changes, runner-config edits, changed numeric literals in tests)
  are only ever *questions* (CLARIFY); put `weakening: <reason>` in the WO's evidence to answer them.
- `retro: { issuance, archiveDebt, staleDays, staleCount, gcPlans, planeLagDays, distill, ledgerKb, off: [...] }` — thresholds of
  the retro trigger (PRO-25): `health` shows `retro due` as WARN when any of the seven indicators crosses its threshold; the agent then
  writes one proposal line in HANDOFF §4 and a human opens the retro session. `node scripts/retro.js --record --write --adopter` drafts the
  round record (`plan/analytics/ANL-00<x>_retro_<date>.md`, `parent: up:PRO-25`). Defaults: 30 · 10 · 30d · 5 · 1 · 30d · 30 · 30 KB.
- `mnemonic: <token>` (frontmatter, any document — not adapter.json): optional override of the **derived label** that
  `sprint/next.md` and MCP `list_docs` show next to an ID (`[WO-27a-1 · prereq_upstream]`, PRO-26 ④). Without it the label is
  the first 1–2 tokens of the document's own slug, else its direct parent's. A mnemonic is inherited through `plan:`/`parent:`
  and then ID arithmetic — never across a legacy range below `lineage.arithmeticFrom` (a numeric root's label on an unrelated
  document is a false label). File names and IDs never change. `node scripts/label.js` prints the generated table.
- `localOwned: [...]` — globs (`*`, `**`, `?`, '/' separators) of files that are **yours** although they sit where template files
  sit (e.g. `scripts/verify.js`, `scripts/*-linter.js`). `template-update` neither reports them as "removed upstream" nor
  touches them on `--apply`. If a glob also covers a file the upstream ships (listed in `scripts/ship-manifest.json`), **sync
  wins** and the report warns — narrow the glob. To accept upstream for *one* forked file while keeping the other
  forks, pass paths: `node scripts/template-update.js --apply --force scripts/dashboard.js`. Scripts not listed in the manifest are local by default, so most adopters need
  no `localOwned` at all; upstream-only scripts (eval, adopter-arm, census, …) are no longer delivered and leftover copies
  are listed as removable.
- `sections: { "목표": [...], "수용 기준": [...], "증거": [...] }` — your own headings for the three required WO sections
  ([PRO-28] ①). Keys are the upstream meanings; values are local spellings (`"목적"`, `"목적·진입 조건"`, `"수용 게이트"`, `"검증"`, …).
  Headings are normalised (leading numbers, trailing colons, whitespace) and matched exactly, then by prefix at a token boundary,
  then by a contiguous token run (`5. G5 완료 기준` → 수용 기준; `비목표` is not 목표; particles such as 와/과/은/는 are ignored
  on tokens). A heading resolves to **one** meaning — the longest matching alias wins — so a combined heading like `검증·완료 기준`
  counts as 수용 기준 and the evidence is read from frontmatter `evidence:`. `sectionsExclude: [...]` lists headings that must
  never match (`진행 기록`, `비목표`) even when an alias token overlaps. A `status:` that *starts* with an upstream word
  (`Active — …`) is read as that word without a map; your own words still go through `statusMap`. `work-close --table`
  resolves the issuance contract through the map; an unmatched document is a CLARIFY that names the map, never a REJECT, and
  existing documents are not rewritten. A `## 증거` section is not required when frontmatter `evidence:` is present.
  New WOs: `node scripts/scaffold.js WO --parent <DOMAIN-ID> --title "…" --write` (PRO-28 ④) proposes the next number under the
  parent (or domain max + 1 below `lineage.arithmeticFrom`), refuses a dead parent or an existing file, and writes the three
  required sections using the **first alias** of each key in your `sections` map — so new documents follow your own spelling.
  Reading: `node scripts/upward-fetch.js <ID> --sections [names]` ([PRO-28] ③) injects only the contract sections of each parent
  document (resolved through the same map, plus any names you pass) and lists the omitted sections with their token size, so a
  session no longer opens a 40–80 KB plan whole. The default output is unchanged.
- `budgets: { project, profile, handoff, total }` — recalibrated bootstrap token budgets (positive integers; defaults 2000 · 800 ·
  1500 · 4000). `context-budget`, `handoff-linter`, `health` and the dashboard read them, so a repo whose HANDOFF legitimately
  needs 2,200 tokens declares it here instead of forking `context-budget.js` (a fork is overwritten or preserved stale on every
  update — an adopter did exactly that and lost the upstream CJK token coefficient). Unknown keys and non-positive values warn.
- `upstreamIgnored: [...]` — globs of upstream files this repo **refuses** (e.g. `.github/workflows/harness.yml` in a repo that
  retired GitHub Actions and gates through `docker-compose.harness.yml` + `scripts/ci.js`). Unlike `localOwned`, a refusal beats the
  ship manifest: the file is neither delivered, re-delivered on the next `--apply`, nor reported. Refusing a `scripts/` file is
  reported as a possible gate weakening (the CI chain skips absent steps), so keep refusals to CI/config files.
- Documents without a `status:` line are counted as *nothing* by every tool. List them with
  `node scripts/frontmatter-backfill.js` (dry-run: estimate from a body marker such as `Status: Done`,
  then from an `archived/` directory, else left blank and reported) and apply with `--apply` — it inserts
  **one `status:` line** in your own vocabulary; the map above does the rest. Upstream never edits your
  documents: the script and the dry-run are its part, applying and committing are yours.

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

### How you learn an update exists (PRO-29 ①)
`node scripts/health.js` shows an **`upstream`** line (INFO only, never a failure). It reads a cache in
`.union-stack/template-sync.json` (`lastCheck`) and refreshes it at most once per 24h; offline is reported, not guessed.
When it says *업데이트 있음*, run `node scripts/template-update.js --proposal`: a plain-language proposal (what changed,
⚠ migrations, what `--apply` would update / skip / hold, files that need a human diff). It writes nothing. **Show it to
the human and apply only after their approval** (`--apply`, then `health` + tests). Agents never `--apply` on their own.
`health --root <other repo>` and `--offline` never refresh (no writes, no network).
*업데이트 있음* appears only when there is something to **do**: files `--apply` would update, review changes nobody has seen yet,
⚠ migrations, or a newer release. Kept forks, files without an anchor, held files and already-seen review changes show as
*실행할 것 없음(…)* with counts. A review change counts as seen after `--apply`, or after `--ack-review` when the human looked at it
and decided not to merge. It is flagged again only if upstream changes that file again. Expect one alert the first time you run the
new version: nothing has been marked seen yet.

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

If `work-close --table --write` (or `scaffold`) created a file for you before this fix, its header may cite an upstream ID
as `[PRO-15]`, which your `ref-linter --strict` reports as broken (you have no local PRO-15). Change it to `[up:PRO-15]`
in the comment line above the marker block (outside the generated block, so it is yours to edit). New files are written that way already.

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
