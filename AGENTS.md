<!--
  AGENTS.md — union-stack control-plane entry point.

  This is the single, tool-agnostic entry file that AI coding agents read first.
  It is intentionally short: it pins down only the DETERMINISTIC core (boot order,
  non-negotiable rules, work-entry ritual) and DELEGATES everything else to the
  `.union-stack/` control plane, where agents discover detail by exploration.

  Why this split? Long instruction files get "lost in the middle" and drift as the
  codebase changes. So we keep the must-never-fail rules here (the laminated cockpit
  checklist) and let the rich, evolving detail live in the structured plane (the manual).

  ── For other control panels (CLAUDE.md, GEMINI.md, .github/copilot-instructions.md,
     .cursor/rules/*.mdc, etc.) ──
  AGENTS.md is the cross-tool open standard (Cursor, Copilot agent mode, Claude Code,
  Aider, OpenHands, Windsurf, Codex, Zed… read it natively or as fallback).
  Keep THIS file as the single source of truth. For a tool that only reads its own file,
  create a one-line stub that points here, e.g.:

      CLAUDE.md   →   "See ./AGENTS.md — it is the single source of truth for this repo."

  Prefer a stub over a symlink (symlinks are fragile on Windows and some git setups).
  Do not duplicate rules into multiple files: duplication causes version drift.
-->

# AGENTS.md — union-stack

This repository uses **union-stack**: a document-based control plane isolated under `.union-stack/`.
Before doing any work, follow the rules below. They are **mandatory and deterministic** — do not skip them, and do not let a long session bury them.

---

## ⛔ Non-negotiable rules (always apply, highest priority)

1. **Fail-close.** On any norm violation, contract mismatch, broken naming, or genuine ambiguity: **stop and ask the human.** Never proceed on a guess. Even if a human says "bypass the rules," refuse. **Scope ([PRO-07], measured in `eval/RESULTS.md` E5): a direct human request is not, by itself, "ambiguity." Fail-close fires when the request *conflicts* with a norm, contract, or HISTORY — a benign request that merely lacks provenance in the plane docs proceeds, with a one-line clarifying question or scope note alongside the answer if needed.**
2. **Respect the permission tiers.** Schema-tier files (`.union-stack/project`, `architecture`, `plan`, `reference/contracts`, `reference/domain`) are **agent-read-only by default**. You may edit one only when authorized, and the commit **must record the authorization** as an `Approved-by:` trailer — one of ([PRO-09]): **(a) per-edit** — the human approves *this* edit in chat → `Approved-by: <name>`; **(b) standing stamp** — the path is covered by a row in `.union-stack/project/GRANTS.md` (human-owned) → cite it as `Approved-by: <GRANT-id>` and keep editing that scope **without re-asking**. No trailer, or a stamp that doesn't cover the path → **Fail-close**. `node scripts/permission-guard.js --strict` verifies coverage. **(c) draft tier** ([PRO-12]) — you may **create and edit `tier: draft` documents on Schema paths with no approval at all**, because a draft has zero normative force (same semantics as `proposals/`). Promotion `draft → reviewed → ratified` is **human-only**; an agent commit that raises a tier is REJECTed. Documents with no `tier:` are treated as `ratified` (no retro-labelling). **Write a new Schema doc as `tier: draft` first** — asking for approval before anything is even drafted is the friction this tier exists to remove. (A rule/norm *change* still goes through `proposals/PRO-*`; the trailer is the permission to touch the file, the PRO is the decision to change the rule.) Wiki-tier files (`feature`, `sprint`, `reference/lessons`, `reference/tools`, `verification/derived`, `profile`) get **row-level atomic edits only — never full-file rewrites**. Raw-tier (`verification/raw`, `archive_ledger.md`) is append-only and system-driven. Append-only also applies to `plan/meetings` (never rewrite a past meeting — add a new `MTG-*`) and `plan/analytics` (never rewrite a past analysis — add a new `ANL-*`).
3. **Obey ZFS naming.** Any new control-plane file must match `[DOMAIN]-[LUHMANN_ID]_[slug].md`. Letters in the ID **exclude `l` and `o`** (confusable with 1/0). When in doubt, run `node scripts/zfs-linter.js` — a non-zero exit means stop.
4. **Reuse, don't recreate.** Before creating types, test fixtures, mocks, or helpers, check `.union-stack/reference/contracts/` first. Recreating an existing asset is a defect.

---

## 🚦 Session bootstrap (read in this exact order)

1. `.union-stack/project/` — what this project is. Holds three time axes: `IDENTITY` (present), `roadmap/` (future direction), `HISTORY.md` (past turning points — read this to avoid regressing into abandoned directions).
2. `.union-stack/profile/` — **who** is involved. Read the active user profile (and your own agent profile) and adapt speech level (존댓말), 호칭, tone, and verbosity before any work. Cascade: user > team > org for preferences; `org.policy.*` guardrails win. Real profiles are `*.local.md` (gitignored); see `profile/_GUIDE.md`.
3. `.union-stack/sprint/HANDOFF.md` — where the previous session stopped and what to pick up.
4. Take the changed-location IDs from HANDOFF and run **Upward Fetching** (below) to restore context.

When the session **ends**, update `.union-stack/sprint/HANDOFF.md` with the 5 required parts:
summary · changed-location IDs · next task (single entry point) · open issues/cautions · verification status.

> **Context budget (smallest high-signal set).** The bootstrap injects `project` + active `profile` + `HANDOFF`; per-task it adds Upward Fetching output. Keep the static bootstrap lean — soft ceilings: project ≤ 2000, profile ≤ 800, handoff ≤ 1500 tokens (total ≤ 4000). If a section exceeds it, do not pad the prompt — apply *extreme compression*: split by ZFS lineage, summarize, or replace prose with bracket-ID links (`[PLAN-01a]`) for on-demand fetch. Self-check: `node scripts/context-budget.js` (also a `context budget` dimension in `scripts/health.js`). This keeps the harness from self-inducing the context-rot it exists to prevent.

### 🗂️ Where to record (route every past/decision by *kind* — don't pile into one place)
- Volatile session progress → `sprint/HANDOFF.md` (latest only)
- A failure seen 2–3× **in a lineage (repo/product-specific)** → `reference/lessons/LSN-*`
- A recurring **environment/machine/cross-repo** fact or preference → the agent platform's private cross-session
  memory (Claude Code: `MEMORY.md`), NOT a committed `LSN-*` ([ADR-11] — leakage + injection-economics boundary)
- A proposed harness-rule change → `proposals/PRO-*`
- A tactical decision (ADR, task/ZFS-scoped) → `archive_ledger.md` (append-only)
- A strategic turning point (pivot, dependency adopt/drop) → `project/HISTORY.md` (fact + reason)
> A tactical ADR that gains strategic weight is *promoted* (compressed) into HISTORY. Full rationale: `DESIGN_RATIONALE.md` §7.

### ⛔ 재제안 차단 목록 ([PRO-14] — 결정된 것을 다시 꺼내지 마라)
아래는 **이미 결정되어 재제안이 금지된** 방향이다. 각 항목의 *재개 조건*이 충족되지 않았다면 다시 제안하지 말고,
충족되었다고 판단하면 그 근거를 먼저 제시하라. 근거는 각 ID의 원장·제안 항목에 있다.
<!-- blocks-index:begin — generated by `node scripts/blocks-index.js --write`; do not hand-edit -->
- (없음)
<!-- blocks-index:end -->

---

## 🧭 Work-entry ritual — Upward Fetching (before writing ANY code)

Given a task like `WO-01a1-2`:

1. Parse the ID → derive ancestors: `01a1` → `01a` → `01`.
2. Globally scan for the same lineage across domains and load into working memory:
   `PLAN-*`, `FLOW-*`, `CON-*` sharing those IDs.
3. **Check `.union-stack/reference/lessons/LSN-*` of the same lineage** — past repeated failures, injected as pre-warnings.
4. Only after grasping both **space** (parent context) and **time** (past pitfalls), begin.

> Automate steps 1–3: `node scripts/upward-fetch.js <ID>`. Before editing/deleting a node,
> run `node scripts/blast-radius.js <ID>` — it Fail-closes (exit 1) if a Verifying descendant exists.

> **Fleet orchestration (sub-agent teams — [PRO-06]).** When a **lead** agent runs a team, it
> partitions work by ZFS lineage — *one sub-agent = one lineage subtree* ([PRO-05] partition key).
> Each sub-agent runs the ritual above on **its own subtree root** (upward-fetch + blast-radius;
> a Verifying node means another agent owns it — do not invade). Lineages that overlap and
> cannot be split → serialize or **escalate to the human (Fail-close)**, never edit concurrently.
> Sub-agents return structured results to the lead; the **lead alone writes the consolidated
> `sprint/HANDOFF.md`** (it is latest-only, so a single author avoids multi-writer contention).
> Team membership/roles are declared in `profile/agent/team_*.md`; concurrency/merge is [PRO-05].

> **Work-type scenarios ([PRO-10], `kind: scenario` cards).** For a work archetype with a codified
> procedure (e.g. defect correction), the **human selects the scenario** — activation is `manual` by
> default, because routing is the measured-weak half (automatic selection performs no better than
> random). At most one scenario is active; switching mid-task is allowed but **must be recorded with
> its reason**. A scenario stays `Draft` until an A/B delta lands in its `evidence[]`.

Reference other documents by **bracket ID** (`[PLAN-01a1]`), never by relative path.

## 🏁 Work-exit ritual — closing a WO ([PRO-15], the mirror of the above)

Entry loads the parent axis; **exit writes back to it.** A work order is not closed by saying so —
two facts must be checkable in the diff:

1. **A trace on a parent axis** — `feature/live.md` · `verification/derived/{state,gap}.md` · `CON-*`.
   Record the path(s) in the WO's `closed_by:`.
2. **Evidence stated** — `evidence:` holds a test/artifact/commit, **or** `none — <이유>`. Never blank
   (distinguishing *forgot* from *not applicable* is the point).

```bash
node scripts/work-close.js <WO-ID>          # 점검 — CLARIFY only, never blocks
node scripts/work-close.js --table --write  # sprint/next.md 작업대 뷰 재생성
```

> `sprint/next.md` is a **generated view**; the single source of truth is each WO's frontmatter `status:`
> (`Draft → Active → Verifying → Closed`). Never hand-edit the table — set the status and regenerate.
> At **session end** move Closed WOs to `sprint/archived/` (never delete them: that is what keeps
> `plan/_GUIDE`'s GC condition — "every successor in the lineage is terminal" — computable).

---

## 📂 Everything else: explore the plane

The full methodology — what each pillar holds, how verification works, how proposals flow —
is documented inside `.union-stack/`. **Each directory has a `_GUIDE.md`** stating what to put in and keep out.
Read the relevant `_GUIDE.md` before acting in that area. Do not rely on this file for detail;
this file only pins the deterministic core. The detail lives in the structure.

- Naming spec & verified logic: `.union-stack/architecture/ARCH-00_zfs_naming.md`, `scripts/`
- Enforced gates (a non-zero exit means stop): `node scripts/zfs-linter.js` (naming), `node scripts/history-linter.js` (HISTORY fact-with-reason), `node scripts/permission-guard.js` (append-only integrity; `--strict` also checks Schema edits carry an `Approved-by:` trailer).
- Full design rationale: `DESIGN_RATIONALE.md`
- Self-evolution: propose harness-rule changes in `.union-stack/proposals/` (never edit Schema directly).
- Need to explore before planning? Use `.union-stack/spike/` (no naming/ritual, ephemeral). Resolve each spike: promote→plan / distill→lesson / discard.
- Runtime query surface (read-only): a zero-dep MCP server (`scripts/mcp-server.js`, registered via `.mcp.json`) exposes `upward_fetch`, `blast_radius`, `where_to_record`, `zfs_lint`, `list_docs`. Claude Code also has `/upward-fetch`, `/blast-radius`, `/where-to-record`, `/zfs-lint`, `/list-docs`. Writes are NOT exposed — edit files directly (governed by the gates).
- Self-check: `node scripts/health.js` reports gate status + structural metrics (the runnable scorecard).

### 🧰 Reusable tools index ([PRO-08] — always-loaded catalog; details in `reference/tools/TOOL-*`)
<!-- tools-index:begin — generated by `node scripts/tools-index.js --write`; do not hand-edit -->
- **[TOOL-02]** Upward Fetching (작업 진입 의례 자동화) — 작업 ID의 부모 계보 맥락(PLAN·FLOW·CON·ARCH·MTG) + 같은 계보 LSN(사전경고)을 수집한다. (`scripts/upward-fetch.js`)
- **[TOOL-03]** Blast Radius (영향권 + 잠금 Fail-close) — 노드의 모든 자손(영향권)을 나열하고, Verifying 자손이 있으면 Fail-close(exit 1)한다. (`scripts/blast-radius.js`)
- **[TOOL-04]** Health 조견표 (게이트 + 구조 지표) — 전 게이트 상태(naming·history·leakage·크기·ref·context budget·잠금 노출)와 구조 지표(도메인 분포)를 한 번에 보고한다. (`scripts/health.js`)
- **[TOOL-05]** 런타임 질의 MCP 서버 (읽기 전용 5종) — plane 조회 5종(upward_fetch·blast_radius·where_to_record·zfs_lint·list_docs)을 에이전트 런타임 도구로 노출한다(zero-dep stdio JSON-RPC). (`scripts/mcp-server.js`)
- **[TOOL-06]** init 스캐폴딩 (템플릿 → 실프로젝트 1-샷 전환) — 정체성 시딩·더미(example) 제거·매니페스트 초기화로 템플릿을 실프로젝트로 전환한다(dry-run 기본). (`scripts/init.js`)
- **[TOOL-07]** tools-index 컴파일러 (상시 주입 카탈로그 인덱스) — TOOL 카드들의 한 줄 요약 인덱스를 생성해 AGENTS.md 마커 블록에 주입한다(온디맨드 미호출 문제의 해법 — 인덱스는 항상 보여야 작동). (`scripts/tools-index.js`)
- **[TOOL-08]** check-prereqs (단계 진입 전제 게이트) — 작업 진입 전 필수 산출물을 Fail-close로 검사한다 — 부트스트랩(IDENTITY·HANDOFF 5부) + 작업 ID의 계보 전거(PLAN/CON/ARCH 존재). (`scripts/check-prereqs.js`)
- **[TOOL-09]** transcript-stats (세션 관측 — 의례 자발 수행률) — 로컬 Claude Code 트랜스크립트(*.jsonl)에서 도구 호출 빈도와 **의례 자발 수행률**(첫 편집 전 upward-fetch/blast-radius 수행 비율 — E3 지표)을 측정한다. (`scripts/transcript-stats.js`)
- **[TOOL-10]** smell 린터 (카드 사용 계약 해부 검사) — TOOL 카드가 사용 계약의 최소 해부(용도·언제 쓰지 않나·호출·kind)를 갖추고 비대(>4KB)하지 않은지 Fail-close로 검사한다. (`scripts/smell-linter.js`)
- **[TOOL-11]** Repomix (레포 → 압축 컨텍스트 패킹) [adopt] — 레포 전체(또는 글롭 선택)를 단일 압축 파일로 패킹해 에이전트 컨텍스트로 공급한다(Tree-sitter 압축으로 토큰 ~-70%). (`npx:repomix`)
- **[TOOL-12]** ccusage (토큰·비용 회계) [adopt] — 로컬 Claude Code 트랜스크립트(*.jsonl)에서 세션·일·월 단위 토큰 사용량과 비용을 집계한다. (`npx:ccusage`)
- **[TOOL-13]** Context7 MCP (최신 라이브러리 문서 주입) [adopt] — 작업 중인 외부 라이브러리의 *현행 버전* 공식 문서·코드 예시를 MCP로 주입해 구식 API 환각을 막는다. (`https://github.com/upstash/context7`)
- **[TOOL-14]** worktree 헬퍼 (계보 파티션 물리 격리) — 계보 서브트리별 git worktree(`../<repo>-wt-<id>`, 브랜치 `fleet/<id>`)를 생성/제거한다 — [PRO-05] "락이 아닌 파티션"의 물리 격리 수단. (`scripts/worktree.js`)
- **[TOOL-15]** hook-replay (enforce 경제성 사전 측정) — 과거 실제 편집을 PreToolUse 결정 함수에 재생해 "enforce를 켰다면 무엇이 몇 번 막혔을까"를 훅 설치 없이 측정한다(차단율·유형·대상). (`scripts/hook-replay.js`)
- **[TOOL-16]** session-friction (의도당 마찰 계측 · P₁ 탐지) — 사용자 발화 1건을 의도 1건으로 보고 다음 발화까지의 왕복 턴·토큰·도구 시퀀스를 집계해, 흡수 가치가 있는 **문제 후보(P₁)**를 비용 순으로 제시한다. (`scripts/session-friction.js`)
- **[TOOL-17]** 결함 수정(Defect Correction) 시나리오 — 실패가 존재하고 원인이 미상일 때의 절차(재현→최소화→기원추적→격리→수정→회귀고정). ISO/IEC 14764 *corrective*에 대응하며 절차는 Zeller TRAFFIC + 델타 디버깅을 따른다. (`.claude/skills/defect-correction/SKILL.md`)
- **[TOOL-18]** scenario-rubric (시나리오 A/B 품질 비악화 루브릭) — 런(=세션) 1개의 도구 호출 **순서**에서 결함수정 절차의 관측 가능한 두 지점을 판정한다 — ①재현 선행(첫 편집 이전 실행) ②회귀 고정(테스트 파일 편집 + 이후 실행). E6 성공 바의 AND 절반인 *품질 비악화*를 기계로 낸다. (`scripts/scenario-rubric.js`)
- **[TOOL-19]** eval-arm (시나리오 A/B 팔 집계·비교 + 성공 바 판정) — 두 팔의 전사 디렉터리를 받아 런별 비용(의도당 턴·출력 토큰)을 내고, 델타 + 소표본 유의성(Mann–Whitney U 정확 임계표) + 품질 비악화([TOOL-18])를 합쳐 **E6 성공 바를 기계로 판정**한다. (`scripts/eval-arm.js`)
- **[TOOL-20]** e6-workspace (과제 워크스페이스 빌더 + 숨은 오라클) — `eval/e6-suite/`의 실결함을 **히스토리 없는 레포 사본**에 주입해 A/B 팔이 돌 작업 공간을 만들고, 팔 종료 후 **숨은 오라클**(원 수정 커밋의 회귀 테스트)로 정답 여부를 판정한다. (`scripts/e6-workspace.js`)
- **[TOOL-21]** 템플릿 업데이트 (어답터 ↔ 상류 버전·드리프트 계측) — 어답터 레포의 템플릿 버전(CHANGELOG 최신 헤딩)과 방법론 파일 드리프트를 상류(github.com/ingookang1988/union-stack)와 대조하고, sync 카테고리만 갱신한다. (`scripts/template-update.js`)
- **[TOOL-22]** blocks-index (재제안 차단 표식의 상시 주입 인덱스) — 원장·제안의 `blocks:`/`reopen_when:` 표식을 모아 AGENTS.md 마커 블록에 컴파일한다 — 이미 결정된 방향의 재제안을 다음 세션이 반복하지 않게([PRO-14]). (`scripts/blocks-index.js`)
- **[TOOL-23]** work-close (작업 종료 의례 — 진입 의례의 거울) — WO를 닫을 때 상위 축 흔적(`closed_by`)과 증거(`evidence`)를 검사해 미충족을 CLARIFY로 표면화하고, `sprint/next.md` 작업대 뷰를 WO 문서에서 재생성한다([PRO-15]). (`scripts/work-close.js`)
- **[TOOL-24]** lineage-tree (계보 트리 렌더러) — 평면 전체를 루만 계보 포레스트로 그려 자기완결 HTML 1장으로 낸다. 큰/낯선 평면에서의 (`scripts/lineage-tree.js`)
- **[TOOL-25]** dashboard (평면 대시보드 — 관측 표면 합성) — 관측 표면을 자기완결 HTML 1장으로 **합성**한다. **개요는 전체 대시보드 그대로**이고(요약 카드·계보 (`scripts/dashboard.js`)
- **[TOOL-26]** 어답터 팔 (같은 게이트를 다른 형상에서 한 번 더) — 사본을 만들어 **형상을 바꾼 뒤 기존 도구를 그대로 돌린다**([PRO-17]). 새 게이트가 아니라 같은 (`scripts/adopter-arm.js`)
<!-- tools-index:end -->
