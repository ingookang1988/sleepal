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
