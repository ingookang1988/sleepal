<!--
  This file is the [Schema] layer of a public template.
  It contains methodology only — never real project content.
  All examples are synthetic dummies (example) — replace them after cloning.
-->

# union-stack

**🌐 English · [한국어](./README.ko.md)**

> A document-based **control plane** template for running **plan-first, high-volume development** safely alongside AI agents.
> It treats *knowledge* — not code — as a first-class citizen. Works without a graph DB, using only Markdown + a naming convention + permission boundaries.

> Origin of the name: a document **stack** that **unions** scattered concerns (architecture, planning, work, verification, learning) into a single coordinate system. It continues the evolution from 6-doc-stack to 7-doc-stack.

This repo is an **empty skeleton**. Clone it, replace the dummy examples with your own project content, and you're ready to go. The filled-in content (real ID lineage, test cases, lessons) is *your* asset and need not be public — what is shared here is only the *structure and methodology*.

---

## 0. Why this exists (30 seconds)

As LLM agents gain larger context windows and stronger reasoning, their *capability* grows but *direction* does not arise on its own. The more capable an agent is, the easier it becomes to produce large, plausibly-wrong changes. So structure is not a *crutch* for weak models — it is a *steering wheel* for strong ones.

This harness does one thing every day: **it forces a human's vague intent onto a coordinate system.** The moment "fix the login" acquires the coordinate `[PLAN-01a1]`, the agent's attention gets something to anchor to. Since every current agent is transformer-based, a project well-tokenized with unique identifiers makes attention bind sharply.

> **Measured (v6.0 — see [`eval/RESULTS.md`](./eval/RESULTS.md)).** A controlled A/B (harness-on vs off, same model, same tasks) found one law: **harness efficacy is proportional to the *non-locality* of the required knowledge, and independent of model strength.** For knowledge outside any single code snapshot (a repeated pitfall, an abandoned direction, a contract in another module), on-arm reused/avoided it **+1.0** of the time vs off-arm; for knowledge already inline, the harness added ~0. Crucially the effect held equally for haiku, Sonnet, and **Opus** — even the strongest model is blind to what isn't in its context, which *refutes* "a crutch for weak models" and *confirms* the steering-wheel claim. Discovery stays exact at scale (precision = recall = 1.00 on a 100-node plane, injection bounded by lineage depth). Injected context ≈208 tokens is *measured*; the "~82× avoided rework" ROI is a **modeled estimate** (assumes one 17k-token regeneration per defect — see [`eval/`](./eval/)). Scope caveats: the A/B ran on a reference instance whose tasks were *engineered* to require non-local knowledge, against an off-arm without exploration tools, and **operational hardening (E3 — enforce-mode dogfooding on real work) remains open.** Full method + honest limits: [`eval/PROTOCOL.md`](./eval/PROTOCOL.md), [`eval/CALIBRATION.md`](./eval/CALIBRATION.md).

---

## 1. Three-tier permission model (understand this first)

Knowledge is split into three tiers by *rate of change*, and permissions are granted **asymmetrically**.

| Tier | What | Human | Agent |
|---|---|---|---|
| **Schema** (near-immutable) | norms, identity, plans, contracts | edits | **read-only** |
| **Wiki** (changes often) | live state, work status | curates goals | **atomic row-level writes** |
| **Raw** (append-only) | verified facts, evidence, decision ledger | read-only | append-only (system-driven) |

To these, v5 adds a **fourth tier**:

| **Proposal** | proposed changes to harness rules | approve / reject | **writes, but zero effect until approved** |

The core principle is **Fail-close**. On a norm violation, contract mismatch, or ambiguity, the agent does not proceed on its own — it stops and waits for a human. Even if a human says "bypass the norm," it refuses.

---

## 2. Document map — read it in three layers

The pillars are not flat. They operate at three distinct layers. **All of them live under `.union-stack/`** (an isolated control plane that sits alongside your product code without polluting the project root).

```
.union-stack/                  ← the entire control plane is isolated here
[ FRAME / boundary + time axis ]   "what this project is" — past/present/future in one folder
  project/
    IDENTITY (present)   identity, scope boundary, domain vocabulary. Injected once at session start.
    roadmap/  (future)   milestones & gates — where the project is heading
    HISTORY.md (past)    strategic turning points (pivots, dependency adopt/drop) — fact + reason, anti-regression

[ CELLS / pillars ]    where knowledge actually lives. Placed on an abstraction x state/action grid.
                   state (exists)          action (changes)
  ought(immutable) architecture/               (roadmap lives under project/)
  contract(agreed) contracts/  *           plan/
  actual(observed) feature/                sprint/  (+ HANDOFF.md session relay)
  time-axis(repeat)lessons/    *           (the time-axis counterpart of verification)

[ ARROWS / verification ] dynamic planes measuring whether cells diverge — not pillars.
  verification/raw/       inbound signals (CI/compiler-generated, agent read-only)
  verification/derived/   verification output: gap(norm<->reality), state(structure observed)

[ META / self-evolution ]
  proposals/         proposed harness-rule changes -> human approve/reject -> reasons preserved (= retrospective)
```

(The repo root keeps only `README.md`, `AGENTS.md`, `LICENSE`, `package.json`, and `scripts/`. Everything else is under `.union-stack/`.)

`*` = two planes commonly missing from an ordinary doc-stack. They are this template's differentiator.
- `.union-stack/reference/contracts/` — shared static specs (types/interfaces) and a **test-tooling catalog**. "Things the agent should find and reuse, not recreate."
- `.union-stack/reference/lessons/` — accumulated repeated failures (a mistake log). Injected as a *pre-warning* when entering work.

> Both `*` planes are grouped under `.union-stack/reference/` — *consult-before-act knowledge* (reuse + pre-warning), mirroring how `verification/` groups `raw/`+`derived/`. Permission tiers stay per-member: `contracts` = Schema, `lessons` = Wiki. Two further members: `domain/` (DOM-*, settled subject-matter truth) and `tools/` (TOOL-*, Wiki — a *catalog* of reusable executable assets: scripts, skills, MCP tools; the implementation stays at its real home and `scripts/tool-linter.js` fail-closes dangling pointers).

Each directory's `_GUIDE.md` states "what to put in, what to keep out."

---

## 3. ZFS naming — graph-free lineage inference

Parent/child/sibling relations are inferred from filenames alone, borrowing Niklas Luhmann's Folgezettel numbering.

```
[DOMAIN]-[LUHMANN_ID]_[slug].md      e.g. PLAN-01a1_example_oauth.md
```

- **DOMAIN**: 2–6 uppercase letters, from a **closed whitelist** enforced by `VALID_DOMAINS` in `scripts/zfs_util.js`: `ARCH INF PHASE CON PLAN MTG FLOW WO WF LSN DOM EVD ADR PRO`.
- **LUHMANN_ID**: starts with a digit; digits and letters alternate. Letters **exclude `l`/`o`** (confusable with digits 1/0). Terminal tasks end with `-N`.
  - `01` -> `01a` -> `01a1` -> `WO-01a1-1`
- **slug**: lowercase snake_case. No spaces, hyphens, or uppercase.

> The verified regex and child/sibling logic live in `scripts/` and are guaranteed by tests. The two rituals below are executable: `node scripts/upward-fetch.js <ID>` and `node scripts/blast-radius.js <ID>`. Full convention: `.union-stack/architecture/ARCH-00_zfs_naming.md`.
> **Already use Zettelkasten/Folgezettel or hierarchical plan IDs?** They map to ZFS lineage 1:1 — no conversion. **Migrating an existing project?** See [`MIGRATION.md`](./MIGRATION.md). **Upgrading from an older union-stack?** Per-version changes are in [`CHANGELOG.md`](./CHANGELOG.md).

### Work-entry ritual (Upward Fetching)

When an agent receives `WO-01a1-2`, **before writing any code**:
1. Parse the ID -> derive ancestors (`01a1` -> `01a` -> `01`)
2. Globally scan `PLAN-*`, `FLOW-*`, `CON-*` sharing those IDs -> load into working memory
3. **Check `LSN-*` of the same lineage (past repeated failures)** <- time axis
4. Begin only after grasping both space (parent context) and time (past pitfalls)

### Session bootstrap (the relay)

The order an agent reads when a new session starts:
1. `.union-stack/project/` — what this project is (identity)
2. `.union-stack/sprint/HANDOFF.md` — where the previous session stopped and what to pick up (the relay)
3. Upward-fetch from the changed-location IDs in HANDOFF -> restore the severed context

When a session **ends**, the agent updates `HANDOFF.md` (5 required parts: summary, changed locations, next task, open issues, verification status). Detailed discipline in `.union-stack/sprint/_GUIDE.md`.

---

## 4. Quick start

```bash
# 1. Clone the template
git clone <this-repo> my-project && cd my-project

# 2. Scaffold — seed identity, strip dummies, reset manifests (preview first, then apply)
node scripts/init.js --name "My Project"            # dry-run: shows the plan
node scripts/init.js --name "My Project" --apply    # apply (add --drop-template-bits to also remove template-only assets)

# 3. Fill the IDENTITY TODOs, define architecture norms in .union-stack/architecture/,
#    and write your first plan in .union-stack/plan/

# 4. Validate with the naming linter
node scripts/zfs-linter.js
```

> Need to explore before you can plan? Use the **`.union-stack/spike/`** sandbox — no ZFS naming, no ritual, ephemeral. Resolve each spike via one of three exits (promote to a plan / distill to a lesson / discard). See `.union-stack/spike/_GUIDE.md`.

**Runtime query surface (read-only).** A **zero-dependency MCP server** (`scripts/mcp-server.js`, registered via `.mcp.json`) lets agents query the plane at runtime: `upward_fetch`, `blast_radius`, `where_to_record`, `zfs_lint`, `list_docs`. Claude Code also gets slash commands (`/upward-fetch`, `/blast-radius`, …). Only *reads* are exposed — writes stay on the governed file-edit path. (Other tools: point them at the same server; Cursor uses `.cursor/mcp.json`.)

**Runtime enforcement (opt-in).** The linters above run *after the fact* (commit/CI). For *pre-emptive* enforcement — stopping a bad edit before it lands — two hook adapters apply the rituals at the moment the agent acts: a `PreToolUse` hook (`scripts/hook-pretool.js`) refuses edits to Schema-tier files and edits whose **blast radius** holds a `Verifying`/`Live` node, and a `UserPromptSubmit` hook (`scripts/hook-userprompt.js`) **auto-injects Upward Fetching** (parent context + same-lineage pitfalls) whenever a work ID appears. Because these run commands, you enable them yourself — copy the snippet from [`scripts/HOOKS.md`](./scripts/HOOKS.md) into `.claude/settings.json`; mode is `UNION_STACK_HOOK=warn` (default) `| enforce | off`. The logic is tool-agnostic — point any tool's pre-edit / prompt hook at the same two scripts.

**Self-check & evidence.** `node scripts/health.js` reports gate status + structural metrics (the runnable scorecard); `node scripts/eval.js` scores the harness's *leverage* and predicts realized efficacy (the calibration model); `node scripts/context-budget.js` keeps the bootstrap injection lean. The controlled A/B that turned the value claims into *measured* results — with its honest limits — lives in [`eval/`](./eval/): method in [`eval/PROTOCOL.md`](./eval/PROTOCOL.md), findings in [`eval/RESULTS.md`](./eval/RESULTS.md), proxy↔efficacy model in [`eval/CALIBRATION.md`](./eval/CALIBRATION.md).

Your AI agent reads **`AGENTS.md`** at the repo root automatically (the cross-tool standard). It pins the deterministic rules and points into `.union-stack/`. For tools that only read their own file, a one-line stub (e.g. `CLAUDE.md`) points back to `AGENTS.md` — keep one source of truth, never duplicate rules.

See each directory's `_GUIDE.md` for details.

---

## 5. Public / private boundary (for you, the user of this template)

This repo publishes only the **frame**. The **content** you fill in after cloning is your asset.

- Publishable (the frame): directory structure, naming convention, guides, scripts, synthetic examples.
- Keep private (the content): real ID lineage, real test cases, real lesson logs, real data lineage.

**Leakage caution:** if you make a public fork with examples rewritten too specifically to your domain, your domain leaks. Always keep `example` dummies in public versions.

**Leakage guard (for public template / public forks).** `node scripts/leakage-guard.js` Fail-closes if any content file under `.union-stack/` lacks a dummy marker (`example` / `dummy` / `예시` / `더미`) and isn't an allowlisted methodology file. It is a *tripwire for "forgot to sanitize,"* not a content-understanding tool — a marker is enough to pass, so it can be bypassed. CI gating lives in `.github/workflows/template-guard.yml` and runs **only** when the repo variable `TEMPLATE_MODE=true` is set, so it stays dormant in real-project clones. To enable: repo Settings → Actions → Variables → `TEMPLATE_MODE=true`. Building a real project instead? Leave it unset (or delete the workflow + `scripts/leakage-guard.js`).

---

## 6. License · Contributing

Published as a methodology template. Propose structural improvements via issues/PRs — this *is* the externalized proposal tier of this harness. Never include your private project content in a PR.

> The full design rationale is in `DESIGN_RATIONALE.md`.
