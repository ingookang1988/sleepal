<!--
  Version history for union-stack adopters. Public.
  Source of truth = git log; this file is the human-readable digest.
  Format: Keep a Changelog (https://keepachangelog.com). Newest first.
  ⚠ = migration action required (see MIGRATION.md §"Upgrading from an older union-stack").
-->
# Changelog

All notable changes to union-stack per version. For *how* to apply an upgrade, see
[`MIGRATION.md`](./MIGRATION.md) (§"Upgrading from an older union-stack"). For the *why* behind a
design, see [`DESIGN_RATIONALE.md`](./DESIGN_RATIONALE.md). Entries marked **⚠** require a migration
action in already-adopted projects.

## [Unreleased]
- **PRO-29 ③(b) — `init --adopt <repo> --plan plan.json [--apply]`: apply a human-edited migration map.** Run by the target
  repo's own maintainer, inside that repo; the plan is the JSON from `--out`. Default is a dry-run (zero writes); `--apply` refuses a
  dirty git tree. Rows applied: `high`, plus `medium` rows marked `"approved": true`; `low` and `to: null` rows are only listed;
  edited `to`/`proposedId` values are used after a ZFS re-check (invalid → that row is rejected, as is a glob left in `to`).
  `id`/`dir` rows are renamed and staged in one `git add` (history survives `git log --follow`; per-row `git mv` took ~1 s each on
  Windows — 6 min for 402 rows, now 9 s); `file` rows (ledger, HISTORY, IDENTITY, HANDOFF) are not moved — the target file gets a
  list of source paths for a human to merge by hand. The run also delivers the sync-category files (same list as the kit and
  `template-update`, upstream-only excluded, existing differing files left alone and listed as `localOwned` candidates), lays the
  `.union-stack/` skeleton (`_GUIDE`s), writes an `adapter.json` draft with `private: true` (a real-content repo flips the leakage gate's
  meaning), seeds the sync anchor and runs `zfs-linter` + `work-close --table --write` once. Re-running is idempotent. Measured on a
  fresh nodejs/TSC clone: 402 rows moved, ZFS lint and publication lint clean, `health` all gates green. Plan rows now carry `kind`.
  New shipped file: `scripts/adopt-apply.js`. No migration for existing adopters.
- **MIGRATION.md mapping table: governance gets a home; roadmap includes strategy.** New row: governance / charter / policies /
  code of conduct / working-group structure → `.union-stack/architecture/ARCH-*`, as process norms (the same plane as the ZFS naming
  norm). The roadmap row now also covers strategy and strategic initiatives. Both came from running `init --adopt` on a public
  project (nodejs/TSC), where nine governance docs had no home. `init --adopt` follows the table. Fixes from the same run: only the
  repo-root README maps to IDENTITY; date-only file names keep their date in the proposed slug, and the slug starts with a letter, so
  proposed names are valid ZFS names (the run had produced 396 invalid ones). The summary now counts invalid proposed names. Already-adopted projects need no migration.
- **PRO-29 ③(a) — `init --adopt <repo>`: a filled-in migration map for an existing project (dry-run).** It reads only paths, file
  names and heading lines of the target's Markdown docs (no bodies) and proposes, per document, a home on the plane, a ZFS ID and a
  confidence (high = directory or file name and a heading agree; medium = one signal; low = no mapping, listed for a human). It also
  drafts `adapter.json` (`sections` aliases, `statusMap`, `localOwned`). The rules are tied one-to-one to the MIGRATION.md mapping table
  (a test enforces it), and the target repo is never written. Applying the plan is the next step. New shipped helper: `scripts/adopt-map.js`.
- **`init --drop-template-bits` also removes upstream-only scripts.** It used to delete only the four template bits, leaving the
  20 upstream-only scripts listed in `ship-manifest.json` (eval, adopter-arm, adopter-census …) in every new project, flagged forever
  as "safe to delete". With `--drop-template-bits` they are now deleted, along with their TOOL cards (which `tool-linter` would
  otherwise report as missing an impl), and the AGENTS.md tools-index block is regenerated. On a fresh dropped copy the test suite
  passes 39/39. No migration; existing adopters can delete the copies themselves (`template-update` lists them).
- **`health --root` judges the leakage gate only if the measured repo has it.** An adopter that dropped the template-only
  `leakage-guard.js` was still judged by upstream's own copy of the guard when the census measured it, so it showed a false FAIL.
  If the measured repo has no `scripts/leakage-guard.js`, the gate now reads "해당 없음", the same as when the adopter runs `health`
  itself. No migration.
- **Census weakening signals count only what the adopter changed.** In the first real round, all five weakening signals were
  false: adopters had received upstream's own test changes through `--apply`, or deleted upstream-only copies that upstream told
  them to remove. Files whose content now equals upstream's current blob, and deletions of upstream-only scripts, are excluded,
  and the number excluded is kept in the raw data. Recomputed: 5 → 0. No migration.
- **PRO-29 ② — new adopter deviations reach the upstream human without a new channel.** In the upstream repo only: the
  dashboard overview gets an "어답터 이탈(신규)" card, `adopter-census --handoff` prints the one line to paste into HANDOFF §4,
  `health` gains an `adopter census` line (INFO; asks for a round after 7 days), and `handoff-linter` raises a CLARIFY when the latest
  round has new deviations but HANDOFF §3/§4 does not mention them. A new shipped helper, `scripts/census_round.js`, reads the
  latest private raw data; adopters have none, so nothing changes for them. No migration.
- **PRO-29 ② — upstream sees when an adopter drifts from the rules, and only what is new.** `adopter-census` derives four fixed
  deviation kinds per adopter: a failing health gate; a missing or stale re-proposal blocks block in AGENTS.md, or a kept fork of
  `gate-contract.js`; weakening signals since the previous round's HEAD (upstream `weakening-guard` over the adopter's diff); and
  applicable sync lag. It compares them with the previous round's raw data as **new / persisting / resolved**. `--delta` prints one line
  per adopter, and `--write` adds an "이탈(신규)" column. Git and file reads only, no adopter writes; output holds kind names and counts only. `--raw-dir` keeps experiment data apart.
- **PRO-29 ① — "update available" means there is something to do.** After the second adopter round, all three adopters had
  nothing left to apply, yet `health` said *업데이트 있음* everywhere: kept forks and review files they had already looked at counted
  as updates. Now `template-update` raises it only for files `--apply` would update, unseen review changes, ⚠ migrations or a newer
  release. Kept forks, no-anchor and held files and seen review changes are counts under *실행할 것 없음*. Seen review changes are
  recorded in `template-sync.json` (`reviewSeen`) by `--apply`, or by the new `--ack-review`. `adopter-census` splits sync lag five
  ways: **applicable** (the bar is 0), kept fork, review, upstream-only copy, refused. No migration; expect one alert on first run.
- **Fixes from the first adopter apply round (PRO-29 ①).** Files that upstream tools *write into an adopter repo* now cite
  upstream IDs with the `up:` prefix: the `sprint/next.md` skeleton (`work-close --table --write`), the `scaffold` WO header
  and the `init` reset templates. An adopter's `ref-linter --strict` failed on `[PRO-15]` in a generated file it may not hand-edit.
  The upstream repo itself is unchanged. `adopter-census` now raises ⚠ for anchors missing from upstream history only on **sync**
  paths. The three-way guard ignores review-file anchors and `--apply` never writes review files, so those are shown as
  "review 이력 밖 N(덮어쓰기 없음)". ⚠ If an older generated header in your `next.md` cites `[PRO-15]`, see MIGRATION.md §PRO-15.
- **PRO-29 ①(c) — the update proposal has to reach a human, and upstream can see whether it did.** `handoff-linter` raises a
  CLARIFY (never a block) when the `upstream` cache says an update exists but neither "next work" nor "open items" in HANDOFF
  mentions it. Deferring is fine; it just has to be written down. It reads the cache only (no network) and stays silent upstream.
  `adopter-census` gains a **sync lag** column: the adopter's anchor (the upstream blobs it last received) against upstream
  `origin/main`, by file count, plus files removed upstream, **anchors found nowhere in upstream history** (a local fork
  seeded as "in sync", which the next `--apply` would overwrite), and the adopter's own last check. Git reads only; no anchor = undeterminable. No migration.
- **PRO-29 ① — adopters learn about upstream updates without remembering a command.** `health` gains an `upstream` line
  (INFO only): it reads a check cache (`template-sync.json` key `lastCheck`, next to the anchor — the anchor is untouched) and,
  when run by the CLI on its own repo, refreshes it at most once per 24h (`template-update --refresh-cache`, 15 s cap; offline =
  INFO). `template-update --proposal` prints a human-readable proposal — changes since your version (including unreleased
  upstream entries when files differ), ⚠ migrations, what `--apply` would update, skip (forked / no anchor) or hold, and the
  apply command — and writes nothing. `health --root`, `--offline` and every `gather()` caller (census, dashboard) stay
  read-only. The upstream repo itself shows "해당 없음". No migration.
- **PRO-28 ⑤ — `context-budget` measures `AGENTS.md` and reads `injects:` declarations (advisory).** The largest always-injected
  surface was not counted. It is now reported beside the bootstrap total, with the share taken by generated marker blocks, but kept
  **outside** the total, the OVER count and the exit code (no budget is set for it yet). A PRO that grows an always-injected surface
  declares frontmatter `injects: "+N tok — reason"`; the declarations are summed and a malformed value is a CLARIFY. Output without
  `AGENTS.md` or declarations is unchanged. No migration.
- **PRO-28 §6 — `adopter-census` measures required-section resolution on active WOs.** New column
  "필수 절 매칭(활성 WO)": active count, per-section resolution (목표 · 수용 기준 · 증거, through each adopter's `sections` map and
  frontmatter `evidence:`), and WOs with all three. Read-only, as before. A **잔여 원인** column classifies what is still unresolved:
  no H2 at all / section absent (outside any rule), alias candidate (a heading exists but no alias matches — the top unresolved
  headings are listed), or evidence to backfill in frontmatter.
- **Fixes from the third adopter's apply report (PRO-24 ① follow-up).** `work-close --table` no longer crashes when
  `sprint/next.md` is absent (hand-ported repos): the check is a CLARIFY and `--write` creates the view with its marker block.
  A prose `status:` that starts with an upstream word (`Active — core production green…`) is read as that word even without a
  `statusMap` (exact match counted 2 of 440 WOs as active); local words (`Done`, `Complete`) still need the map.
  `adapter.json sectionsExclude` pushes headings out of the alias match (`진행 기록`, `비목표`). `template-update --apply` now
  **holds** an update that would require a symbol the preserved file does not export (it would crash on load) until the preserved file
  is updated with `--force <path>`. The shipped `gate-contract.test` no longer requires the upstream-only `adopter-census`.
  Follow-up: the first status token now ends at a parenthesis, dash or colon as well as whitespace (`Diagnosed(정정)` → Diagnosed), and
  the dashboard renders work-close CLARIFY messages as inline prose (their own `none — 이유` backticks leaked into the page once an
  adopter mapped 150 active WOs). No migration.
- **Fixes from the first adopter's full apply report (PRO-24 ① follow-up).** `union-stack-kit` now anchors a file that matches
  the guessed clone tag with *that tag's* sha (it wrote the `main` sha, so byte-identical files were later reported as localForked
  and needed `--force`). `template-update` walks `ci/` and `docker-compose.harness.yml` locally (they re-appeared as "new" on
  every dry-run and were rewritten on every `--apply`), and no longer reports a `_GUIDE.md` in a directory upstream does not have
  as "removed upstream" (adopter-made sub-guides are the adopter's). Section resolution (`adapter.json sections`) adds a
  **token-run match** after exact and prefix — `5. G5 완료 기준`, `검증·완료 기준`, `2. 목표와 공통 완료 기준` now resolve to
  수용 기준 (prefix matches only at a token boundary, so `비목표`/`목표와` are not 목표). `scaffold` proposes the next **letter**
  child (`66a…66k` → `66m`, skipping l/o) when a parent already has a letter-child series instead of `66a-1`. After the re-apply
  report: the dependency-mismatch warning now also covers files **already in sync** (an updated `dashboard.js` requiring a preserved
  `handoff-linter.js` was silent in every later dry-run because only that run's targets were checked), and token matching strips
  Korean particles (`목표와 …` → 목표). The warning is then narrowed to **symbol level**: a destructured `require` is compared
  with the preserved file's `module.exports` keys and only a missing symbol is a ⚠ (the adopter saw 41 pairs of which one was real);
  the rest is one INFO line. No migration.
- **PRO-28 ③ — `upward-fetch --sections [names]` injects parent documents by section.** New `scripts/section-fetch.js` splits a
  document at H2, keeps the contract sections (resolved through `adapter.json sections`) plus any names given (prefix match), and
  replaces the rest with one line — `(생략 N절 · ~M tok: heading(~tok) …)` — a table of contents for the next fetch. Documents
  without sections are clipped to a 1,500-token head. The MCP `upward_fetch` tool takes `sections`/`extra` and returns
  `excerpts`. Default output is unchanged. No migration.
- **PRO-28 ④ — `scripts/scaffold.js` (TOOL-36) issues a WO skeleton in one line.** `node scripts/scaffold.js WO --parent PLAN-01a
  --title "…" [--slug …] [--lineage b] [--write]` proposes the next ID under the parent (letter-ending parent → `01a-N`, digit-ending →
  `28a-N`; below `lineage.arithmeticFrom` the domain max + 1), verifies the parent exists in the ZFS index, refuses an existing file,
  and writes frontmatter (status Draft, parent, `evidence: "none — …"`, `closed_by: []`) plus the three required sections — spelled
  with the first alias of your `sections` map — in ≤400 tokens. Dry-run by default; CLARIFY (3) on a dead parent, ID clash, missing
  slug for a non-ASCII title, or an unsupported domain. No migration.
- **PRO-28 ①② — the section contract becomes a read-time mapping.** `adapter.json sections` maps the three required WO
  sections (목표 · 수용 기준 · 증거) to an adopter's own headings (1:N, normalised, exact-then-prefix). `work-close` resolves the
  issuance lint through the map, accepts frontmatter `evidence:` in place of a `## 증거` section, and reports an unmatched
  document as CLARIFY naming the map. Without a map the behaviour is unchanged. Dashboard sprint and norm card titles now render
  inline code and bold instead of leaking the raw markers. No migration.
- **Canary fixes from a third adopter: budgets and refusals become configuration (ADR-29).** `adapter.json budgets`
  (`project · profile · handoff · total`) recalibrates the bootstrap token budgets for `context-budget`, `handoff-linter`
  (`analyze(text, budget)`), `health` and the dashboard — the adopter had forked `context-budget.js` for a 2,200-token HANDOFF
  and lost the CJK coefficient. `adapter.json upstreamIgnored` (globs) refuses upstream files outright — delivery, re-delivery
  and reporting — for repos that retired a shipped CI workflow; refusing `scripts/` files is flagged as possible weakening. The
  lineage tree's status filter and document rows (also embedded in the dashboard), the dashboard's product view (PLAN status
  pills and rows) and norm cards now show the **first token** of `status:` with the full text in a `title` — prose statuses
  leaked raw `**`/backticks into the page; `feature/live.md` cells with an unpaired marker (a `|` inside a code span splits
  the table cell) are closed before rendering. `adopter-census` counts only shipped
  instruments (upstream-only `adopter-arm` was still listed) and adds a **WO H2 heading distribution** column (PRO-28 input).
  No migration.
- **Canary fixes from a second hand-ported adopter (PRO-24 ① follow-up).** `ship-manifest` now returns CLARIFY when a shipped
  file unconditionally requires an upstream-only module (a shipped test required the evaluation-only `fetch-eval` and failed with
  MODULE_NOT_FOUND in the adopter; conditional `try { require }` is accepted and that test now skips the adversarial-plane checks
  when the module is absent). `template-update` warns when a file about to be updated requires a file that is being preserved
  (localForked / no anchor), since the two can drift apart in interface (an updated `dashboard.js` could not find the new
  `partBody` export of a preserved `handoff-linter.js`); `--json` carries `staleDeps`. Three more template-only assertions
  (health gate green, test-catalog asset count/sync, tools-index card completeness) are skipped outside the template repo
  ([ADR-30]). No migration.
- **PRO-24 ①(a) — bootstrap kit for hand-ported adopters.** `scripts/union-stack-kit.js` (**TOOL-35**) is a single
  dependency-free file fetched with one command; its first run is a dry-run, `--apply` fetches only the files
  `template-update` needs that you lack and seeds the sync anchor as `clone@<version>(추정)` with **byte-identical files
  only** — modified files stay unknown so the 3-way protection keeps them. `template-update --seed <ref>` is the explicit
  all-files alternative. Adopter arm gains the `kit` shape. No migration.
- **PRO-24 ① — delivery narrowed to a whitelist; adopter-owned files declared, not guessed.** `scripts/ship-manifest.json`
  (**TOOL-34**, generated from `// @ship upstream-only|optional` tags) lists the scripts upstream ships; `template-update` reads
  the local and the upstream manifest separately, so upstream-only tooling (eval, eval-arm, fetch-eval, scenario-rubric,
  token-accounting, hook-replay, check-prereqs, adopter-arm, e6-workspace, adopter-census) is no longer delivered or reported,
  leftover copies are listed as removable, and scripts outside the manifest are local by default (no more "removed upstream"
  noise for your own files). `adapter.json localOwned` (globs) declares adopter-owned files explicitly; where a glob overlaps a
  shipped file, sync wins and the report warns. The 3-way "modified" class is now reported as **localForked**. No migration —
  without a manifest the previous rules apply.
- **PRO-26 ④ — derived labels next to bare IDs; `mnemonic:` as an optional override.** Where an ID stands alone
  (`sprint/next.md` worktable, MCP `list_docs`) it now reads `[WO-27a-1 · prereq_upstream]`: the label is derived from the
  document's own slug (first 1–2 tokens), else its direct parent's, with a frontmatter `mnemonic:` overriding and being
  inherited through `plan:`/`parent:` then ID arithmetic — never across a legacy range below `lineage.arithmeticFrom`
  (three downstream repos and a cold read rejected slug prefixes and numeric-root inheritance: a false label is worse than
  none). `scripts/label.js` (**TOOL-33**) prints the generated table. No file or ID changes; ARCH-00 unchanged. No migration.
- **PRO-25 — retro is a consolidation machine: observed trigger, human-run round, append-only record.** `scripts/retro.js`
  (**TOOL-32**) measures seven indicators from files and git dates only — issuance since the last round, archive debt, stale
  non-terminal WOs (last commit ≥ 30 d), GC-able PLANs, plane lag (oldest plane; generated views listed separately), distillation
  stall (closures since the last LSN update), ledger size — thresholds in `adapter.json retro:`. `health` gains a `retro due` row
  (WARN when due); the agent's only move is one proposal line in HANDOFF §4. `--record --write` drafts the round record
  `plan/analytics/ANL-00<x>_retro_<date>.md` (meta lineage 00, append-only) with the snapshot, the 8-item checklist and the delta
  against the previous round. No auto-distillation (ADR-12 boundary unchanged). No migration.
- **PRO-22 §3 1·2 — check declarations and execution receipts; a check that saw nothing is a failure.**
  Nine downstream answers found the same defect class in 3/3 repos: a type check idling for three days, a
  permission guard passing an empty stage, a disabled CI staying green. `adapter.json checks[]` declares the
  product checks (`kind` 정적·동작·재현·측정·수용·메타, `env`, `cost`, `expected_zero_unless`); `ci.js` runs them
  after the harness chain and writes one **receipt** line per step to `verification/raw/receipts.md` — runner
  only, with sha · dirty · scope harness/product · targets · passed/failed/skipped · env · generator.
  **targets = 0 → REJECT** for a blocking full scan, NOOP_PASS for diff-conditional (`kind: 메타`), CLARIFY for
  env-conditional. `ci.js --scan` drafts declarations from package scripts, hooks and workflows. `health` gains a
  `receipts` row (latest receipt age per blocking check), `work-close` asks evidence to cite `rcpt:<name>@<sha>`
  (new WOs only). Adopter arm gains the `nonjs` shape. ⚠ `init` now resets `receipts.md` like `evidence.md`.
- **PRO-22 §3 3·4 — weakening is a question, a growing exception list is red.** `scripts/weakening-guard.js`
  (**TOOL-31**, in the CI chain after `permission-guard`) reads the range diff and asks one line per weakening
  signal — deleted test files, added `skip`/`only`, fewer assertions, snapshot updates (by changed *field*, not by
  line count), runner-config edits, changed numeric literals in tests — never blocking; a `weakening: <reason>` in
  the WO evidence answers them. Baseline expiry took form ⓑ: the exception list (skip/only, `eslint-disable`,
  `@ts-ignore`, `noqa`, `nolint`, allowlist/holdout/baseline entries) may grow only under
  `checks[].known_failures` entries with an owner and an expiry, and an expired entry is REJECT.
- **PRO-24 ② — adopter census: read-only measurement of sibling repos, anonymised rows.**
  `scripts/adopter-census.js` (**TOOL-30**) runs the upstream tools with `--root` against a private list of
  local adopter checkouts (never executing adopter scripts, never reading document bodies, never writing to
  them) and appends one anonymised row per repo to `eval/CENSUS.md`: version/anchor, instruments present,
  status distribution (first token, after `statusMap`), evidence rate, backfill targets, duplicate IDs,
  collisions with upstream IDs, an `arithmeticFrom` suggestion, upward-fetch vacancy and
  `upstream_candidate` PROs (IDs only). Raw per-repo JSON stays in gitignored `eval/private/`. No migration.
- **PRO-27 — cross-repo prerequisites: upstream tools read the adopter's plane as it is.** Three adopters
  showed the upstream's assumptions do not hold downstream: upstream and local IDs share one space, status
  is a free vocabulary and often absent, lineage lives in frontmatter rather than ID arithmetic, and
  `health --root` silently measured the upstream itself. **①** `[up:ID]` names an upstream document from an
  adopter; `ref-linter`, `upward-fetch`, `blast-radius` and the MCP server treat it as an external reference
  (INFO), never a local miss — `scripts/upstream-prefix.js` adds the prefix when upstream docs are shipped.
  **②** `adapter.json` gains `statusMap` and `evidenceFields`; `zfs_index` and `work-close` map local vocabulary
  on read (`rawStatus` keeps the original). `scripts/frontmatter-backfill.js` (**TOOL-29**) lists documents
  without `status:` with an estimate and source, dry-run by default; `--apply` inserts one line in *your*
  vocabulary. **③** lineage is first-class in frontmatter: `parent:` / `plan:` are read by the index and
  followed by `upward-fetch`, `blast-radius` and roadmap wiring (ancestors = ID arithmetic ∪ declared
  parents); `adapter.json lineage.arithmeticFrom` switches arithmetic off below a legacy range.
  **④** `health --root <dir>` measures that repo and REJECTs a root without `.union-stack`.
  **⑤** `zfs-linter` REJECTs duplicate IDs within a domain. An empty `upward-fetch` is now CLARIFY (exit 3),
  not a silent pass. Adopter arm gains `legacy`, `serial` and `vocab` shapes. No migration required —
  the keys are optional and absent means the previous behaviour.
- **PRO-17 / ADR-40 — adopter arm: the same gates, run once more in a different shape.**
  Upstream only ever runs its own shape, so a fact that is only true in another shape is observed
  nowhere — eight measured defects across three axes ([LSN-17]). `scripts/adopter-arm.js` (**TOOL-26**)
  makes a copy, changes the shape, and runs the **existing** tools; it is a second execution, not a new
  gate, so the logic stays single-sourced. Two axes:
  `env` (a real `init --apply --drop-template-bits` copy → suite failures 0 · no upstream ADRs left ·
  `health` exit 0 · JS-less reachability) and **`data`** (plane *content shape* only — 13 per-zone tables
  with non-English headers, a `**title — subtitle**` ledger convention, heading-form HISTORY, wrapped
  bold — → no crashes · zero raw markdown markers in the rendered body · live and HISTORY counts exact).
  The `data` axis is new: PRO-17 §5 deferred a shape matrix until "a real adopter breaks after the single
  shape passes", and ADR-31/ADR-37 were exactly that. Every bar was **proven to bite** against the
  pre-fix code before being wired (118 markers · 65 vs 52 rows · 0 turning points · 24 residual ADRs).
  Wired as one CI step. No migration — adopters get a stronger upstream, not a new obligation.
- **ADR-41 — `prose` converts inline markup over the whole text, not per line.** Plane prose wraps at
  ~100 chars, so bold spanning a wrapped line is common; per-line conversion split the pair and the safe
  fallback exposed the raw markers. Bold may now cross a newline but not a blank line (a paragraph
  boundary), so one unmatched marker cannot swallow half a document.
- **⚠ PRO-18 / ADR-36 — ledger rotation: append-only now protects *entries*, not *lines*.**
  `archive_ledger.md` only grows, and the rotation protocol `DESIGN_RATIONALE` §7 has declared since
  v5.11 was **unexecutable** — rotation moves lines out, and `permission-guard` Check A rejected any
  line leaving an append-only file. So the ledger crossed the 30KB cap and could only ever stay over it.
  Check A now runs a **conservation check**: a removed substantive line must reappear **verbatim in
  another append-only path in the same commit**. A move passes; losing one line is still REJECTed, and
  the guard names the lost entry. There is no bypass flag — it verifies rather than trusts.
  Rotated blocks live in `.union-stack/archive_ledger/ADR-<first>_<last>.md` and are append-only too;
  `scripts/ledger.js` is the single source of ledger paths so all five consumers (`ref-linter` row
  anchors, `blocks-index`, dashboard time axis, `health`, `leakage-guard`) read head + shards and
  rotation stays invisible to them. Measured: skipping that step produces 24 ghost references and takes
  the re-proposal block list **6 → 0**, after which a routine `blocks-index --write` blanks the AGENTS.md
  ⛔ block. First rotation applied here: head 42.9KB → **16.3KB**.
  Also fixed: `_GUIDE.md` was classified append-only inside `plan/meetings/` and `plan/analytics/`, so
  editing one line of those guides was REJECTed — guides are methodology text, not entry stores.
  Migration: **none required** — no shards exist until you rotate. When `health` warns on ledger size,
  follow `.union-stack/archive_ledger/_GUIDE.md`. Adopters upgrading get the guard change for free.
- **ADR-37 — three follow-ups to ADR-35, all reported by an adopter.** None are visible in upstream's
  own data shape. ① **The gist is truncated twice** — at the `' — '` separator as well as by length —
  and ADR-35 only repaired the length cut. An adopter whose ledger convention is `**title — subtitle**`
  (bold spanning the dash) got a dangling `**` on every recent-shipping row; the fragment was shorter
  than the cap, so `clip()` never even ran. Truncation now lives in one place (`gistOf`) and whoever
  cuts repairs what it broke. ② **Repair direction flipped from trimming to closing.** Backing off to the
  marker boundary erased the whole string when the opening marker sat at position 0 — found while fixing
  ①, not reported. Closing the marker loses no characters. ③ **live.md header rows were counted as
  shipped features**: headers were detected by vocabulary (`feature`…`status`), which misses non-English
  headers and every table after the first. An adopter with 13 per-zone tables saw the PO tile read
  **122 instead of 109**. Header detection now follows markdown's actual contract — the next line is a
  separator row — and all three `live.md` columns go through `prose` (previously only the first did).
  No migration.
- **ADR-35 — plane prose is rendered, not dumped raw, in the dashboard.** The product axis's entry-point
  card showed HANDOFF §3 as literal markdown (`> ### 🎯 **…**`), which is pure noise on a surface whose
  audience is a PO. A **quoted-prose mini-converter** (`prose()`) now handles the only four constructs that
  actually appear as noise — inline code, bold, leading `>`, leading `#` — and is applied wherever the
  dashboard quotes free-form plane prose (HANDOFF §3/§4/§5, ledger gists, HISTORY, LSN, re-proposal blocks,
  PHASE titles and exit criteria, WO titles, `live.md` rows). Identifiers, statuses and `title=` attributes
  keep plain `esc`. It cannot fail by construction: everything is escaped first (zero injection surface) and
  any syntax it does not understand is left as escaped source — raw text beats a wrong render. No migration.
- **⚠ ADR-29 — adopter configuration + local-modification protection.** New `.union-stack/adapter.json`
  (adopter-owned; upstream never touches it) absorbs the two gate customisations adopters were patching
  into **sync** scripts: `private: true` downgrades `health.js`'s leakage verdict FAIL → INFO (the gate
  protects the *public template*, so in a private repo its meaning inverts), and `zfsIgnored: [...]`
  extends the ZFS naming exemption list. The gates themselves are unchanged — only the scorecard's verdict.
  `template-update` now does a **3-way compare** (local vs last-coherent anchor vs upstream) and `--apply`
  **skips locally modified files**, plus files with no anchor (`unknown` — undecidable is not a pass).
  The anchor lives in `.union-stack/template-sync.json`, written by `--apply` and seeded by `init.js`.
  Measured trigger: one `--apply` silently overwrote 2 legitimate adopter patches and 2 gates went FAIL.
  Migration: **existing adopters need `--apply --force` once** (no anchor yet); after that, only your
  real modifications are preserved. Better: move the modifications into `adapter.json` and drop the patches.
- **⚠ ADR-30 — the self-test suite now passes in a fresh adopter repo.** Five assertions asserted this
  repo's *template plane content* (a dummy `01a` lineage, the ledger's `ADR-02`, `archive_ledger.md` in the
  size top-N, "all 8 overview sections", "gating empty"), so `node --test scripts/*.test.js` could not go
  green after `init --apply` — which blocked adopters from gating on the harness's own tests at all.
  Assertions were rewritten as **contract assertions** (a section renders iff its source data is non-empty —
  strictly stronger than before) or guarded by **fixture detection**; only template-cleanliness assertions
  use the repo-mode discriminator (`package.json` name). Also: `npm test` hardcoded 34 filenames and died
  on the first missing one in a `--drop-template-bits` adopter → now `node --test "scripts/*.test.js"`.
  Migration: copy the new `test` script into your `package.json` (it is a **review**-category file).
- **ADR-31 — HISTORY heading-form entries are recognised.** Projects migrated via `MIGRATION.md` naturally
  keep HISTORY as `### YYYY-MM-DD — title` + context/decision/rationale/impact; that shape was invisible to
  the parser, so the dashboard time axis showed **0 strategic turning points** and the linter passed silently.
  Now: **counting** sees both shapes, **REJECT** stays table-only (a table's columns *are* the contract), and
  a heading entry with no detectable reason is **CLARIFY** (free prose can't prove absence). No migration
  required — re-run `node scripts/history-linter.js` and the count is real. See MIGRATION.md §"HISTORY 형식".
- **ADR-32 — `dashboard.js --sections <module>`.** `dashboard.js` is a sync file, so an adopter wanting its
  own KPI section had to fork it (drift) or ship a second HTML page (breaks the synthesis principle). An
  adopter-owned module now exports `[{id, title, axis, axisLabel?, render(gathered)}]`; a new `axis` id
  creates a whole axis (nav + radio + router CSS). The host wraps the card, and a section that throws
  reports inside its own card only.
- **ADR-33 — dashboard product axis (5th page).** The existing four axes all address the *harness operator*.
  The product axis answers a PO's four questions from data already in the plane: current PHASE + single entry
  point (HANDOFF §3) · roadmap progress (PHASE exit clauses) · Now/Next/Verifying board (WO `status:`) ·
  PLAN status rollup · recent shipping (ledger + `feature/live.md`) · risk (locks + gate debt + HANDOFF §4).
  Observation, not verdict: exit-satisfaction is read from `✅` markers and is never promoted to a score;
  a phase with zero exit criteria is reported as **"no criteria"**, not as achieved. No configuration.
- **⚠ PRO-15** — work-order closure. `sprint/` gains real `WO-*` documents (frontmatter `status`,
  `evidence`, `closed_by`) and `sprint/next.md` becomes a **generated view** of them; `scripts/work-close.js`
  (**TOOL-23**) is the work-*exit* ritual mirroring Upward Fetching. Closes a structural hole: entry had
  three gates and exit had none, so `plan/_GUIDE`'s GC condition ("every successor in the lineage is
  terminal") was undecidable and no plan could ever reach `Crystallized`. Closing a WO now requires two
  checkable facts — a trace on a parent axis, and evidence stated (or `none — <reason>`). CLARIFY-only.
  Also **removes `Live` from the lock vocabulary**: code locked on it while no guide defined it and no
  index path could ever produce it — a safety device that could never fire. `Verifying` remains the lock.
  Migration: add the `worktable` marker block to `sprint/next.md` (see MIGRATION.md §Upgrading); replace
  `Verifying/Live` with `Verifying` in any text you copied. Existing plans need no changes.
- **⚠ PRO-14** — re-proposal blocks. A decision that must not be relitigated carries `blocks:` +
  `reopen_when:` (ledger entry or `PRO-*` frontmatter); `scripts/blocks-index.js` (**TOOL-22**)
  compiles those into an always-injected AGENTS.md marker block, the same shape as `tools-index`.
  Closes a structural gap: rejection *records* were preserved (proposals/_GUIDE Supersession
  principle) but nothing **delivered** them — no injection path reaches `proposals/` or
  `archive_ledger.md`, so delivery relied on hand-copying into HANDOFF (latest-only).
  `reopen_when:` also gives decisions the `valid_time` axis lessons already had.
  Gate is CLARIFY-only (never blocks), wired into `npm run lint`.
  Migration: add the marker block to your `AGENTS.md` (see MIGRATION.md §Upgrading) — without it
  `blocks-index` reports CLARIFY. Existing ledger rows need **no** retro-labelling.
- **TOOL-21** — `scripts/template-update.js`: adopters check their template version (latest
  CHANGELOG heading) and methodology-file drift against upstream, then apply sync-category
  updates (`--apply`). Never touches `.union-stack/` content; review-category files (AGENTS.md,
  `_GUIDE.md`) are reported only. Surfaces ⚠ migration items from the upstream changelog.
- **⚠ PRO-11·12·13** — gate contract layer (`--contract` declaration, 4-value outcomes
  PASS/REJECT/CLARIFY/HOLD with **REJECT-only blocking**), trust-tier gate (`tier: draft`
  agent delegation, human-only promotion), `handoff-linter` (5-part + 1,500 tok budget,
  never blocks). Migration: adopters re-wiring their own CI should copy harness.yml's
  exit-code mapping (only exit 1 fails the build; 3/4 are annotations).
- **PRO-08** — new `reference/tools/` member (`TOOL-*` domain): a *catalog* of reusable executable
  assets (scripts, skills, MCP tools). Catalog-only (implementation stays at its real home), Wiki
  tier, `scripts/tool-linter.js` fail-closes dangling `impl:` pointers.
- **PRO-07** — Fail-close scope qualifier in AGENTS.md rule 1 ("a direct human request is not, by
  itself, ambiguity"), driven by the E5 harm-arm measurement (`eval/RESULTS.md`); re-measured and
  verified (H1 delta −0.8 → 0, T3 guard intact).
- **PRO-06** — agent-team resource + lineage-partitioning orchestration. Proposal-stage; not yet a
  released harness rule.

## [6.0.0] — 2026-06-15
**The Empirical Harness.** Efficacy moved from claim to measurement.
- Controlled A/B (harness-on vs off, same model/tasks) establishes the core law: efficacy is
  proportional to the *non-locality* of required knowledge and independent of model strength
  (held equally for Haiku, Sonnet, Opus). See [`eval/RESULTS.md`](./eval/RESULTS.md).
- New eval surfaces: [`eval/PROTOCOL.md`](./eval/PROTOCOL.md),
  [`eval/CALIBRATION.md`](./eval/CALIBRATION.md), [`eval/RESULTS.md`](./eval/RESULTS.md),
  reference instance under `eval/reference-instance/`.
- Discovery shown exact at scale (precision = recall = 1.00 on a 100-node plane; injection bounded
  by lineage depth); injected context ~208 tokens (measured) vs ~82× that in avoided rework
  (modeled — assumes one 17k-token regeneration per defect).
- **Scope note:** evidence was established on an engineered reference instance (tasks built to
  require non-local knowledge; off-arm without exploration tools). **E3 — enforce-mode dogfooding
  on real work — remains open**; v6.0 marks evidence established, not operational hardening.
  See `.union-stack/project/roadmap/PHASE-02_empirical_harness.md`.
- README (EN + KO) synced with runtime hooks + eval surfaces.

## [5.15] — 2026-06-14
- Runtime enforcement hardening + efficacy-eval groundwork (code-review follow-ups).

## [5.14] — 2026-06-10
- **New profile pillar: the actor axis** (`.union-stack/profile/` — human + agent). Captures *who*
  is involved (user/team/org, agent/agent-team). See [`PRO-03`](.union-stack/proposals/PRO-03_profile_pillar.md).

## [5.13] — 2026-06-09
- **New `ANL` (analytics) domain** under `.union-stack/plan/analytics/` — the plan's second raw input
  alongside meetings. See [`PRO-02`](.union-stack/proposals/PRO-02_analytics_domain.md).

## [5.12] — 2026-06-08 ⚠
**Bundle B — folder renames + plan lifecycle.** Two directories renamed so the folder name matches
its meaning:
| Old (pre-5.12) | Current | Why |
|---|---|---|
| `mechanism/` | `verification/` | "mechanism" collided with "architectural mechanism"; this plane verifies |
| `topology/`  | `architecture/` | matches the `ARCH` domain; "architecture norms" is clearer |

**Action:** move the folders and update any bracket-ID/text references; IDs themselves are unchanged.
See [`MIGRATION.md`](./MIGRATION.md) §"Upgrading from an older union-stack".

## [5.11] — 2026-06-08
- Adopter-feedback bundle A: **domain plane** (`reference/domain/DOM-*`), [`MIGRATION.md`](./MIGRATION.md)
  added, and size/ref structural checks in `scripts/health.js`.

## [5.10] — 2026-06-08
- **Self-evaluation**: `scripts/health.js` is a runnable scorecard (gates + structural metrics).

## [5.9] — 2026-06-07
- **Runtime query surface**: zero-dependency MCP server + slash commands
  (`upward-fetch`, `blast-radius`, `where-to-record`, `zfs-lint`, `list-docs`).

## [5.8] — 2026-06-07
- **Onboarding**: `scripts/init.js` scaffolding (seed identity, strip dummies, reset manifests)
  + `spike/` lane for throwaway experiments.

## [5.7] — 2026-06-07
- P1: past-store routing (where-to-record) + permission enforcement.

## [5.6] — 2026-06-07
- Added `plan/meetings/` (raw deliberation, append-only) + `architecture/infra/` (infra norms).

## [5.4] — 2026-06-06
- Enforce HISTORY fact-with-reason discipline (`history-linter`).

## [5.3] — 2026-06-06
- Enforce declarations + lineage CLIs + leakage guard + English guides.

## [5.2] — 2026-06-06
- Integrate roadmap + history into `project/` (the time 3-axis).

## [5.1] — 2026-06-05
- Initial public template: document-based control plane for AI-agent system coding.

<!-- Note: v5.5 had no release entry — it landed as a design-only change (grouping contracts+lessons
     under reference/, commit 2026-06-07). Its rationale is recorded as [v5.5] in DESIGN_RATIONALE.md §7. -->
