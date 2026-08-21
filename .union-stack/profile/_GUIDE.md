# profile/ — the ACTOR axis (who is involved) guide

> **Position:** union-stack's first axis about *actors*, not artifacts. Every other pillar records
> the work; profile records **who works** — humans (user ⊂ team ⊂ org) and agents — and their
> **descriptive communication/persona preferences** (honorifics, forms of address, tone, language,
> verbosity). Approved via `[PRO-03]`; deliberation in `[MTG-02a]`.
> **Permission: Wiki** — owned by the person/agent it describes; row-level atomic edits.
> **Naming: NOT ZFS.** Profiles are a flat *registry* (like `feature/live.md`), not a decomposition
> tree — a user is not a "child task" of a team. Free-form filenames; the ZFS linter does not scan here.

## What goes in
- `human/` — user, team, org profiles (nested by *reference*, never embedding; SCIM-style).
- `agent/` — agent profiles (declarative card: name/description/version/provider; A2A-style).
- Descriptive preferences only: how to address someone (존댓말 level, 호칭), tone, language, verbosity.
- **Declarative authority** (`authority:` field) — advisory documentation of who owns/approves.
  The control plane does NOT enforce it; enforcement belongs to the agent platform
  (hooks/permissions in Claude Code, Codex, etc.). CODEOWNERS pattern: declare, don't enforce.

## What stays out
- Project identity → `project/IDENTITY*` (what the project is ≠ who works on it).
- Enforced RBAC / credentials / secrets — never store auth material here.
- **Real PII in the shared repo** — real profiles live in gitignored `*.local.md` files
  (ecosystem convention, cf. `AGENTS.local.md`); only `*example*`-marked dummies are committed.

## Cascade (how agents resolve layered preferences at bootstrap)
1. Read org → team → user in that order; **most-specific wins** for preference scalars
   (user > team > org — the unanimous rule of git config / VS Code / Claude Code memory).
2. Object-typed fields deep-merge per key; scalars/arrays replace wholesale.
3. Exception: keys under `org.policy.*` are guardrails — **org wins** (IAM/SCP pattern).
4. Free-text persona notes concatenate, most-specific last.

## Bootstrap consumption
Session bootstrap (AGENTS.md) reads the active user profile (and the acting agent's profile)
right after `project/` — the agent adapts speech level (존댓말), 호칭, tone, and verbosity
before doing any work.

## Files
- `human/user_*.md`, `human/team_*.md`, `human/org_*.md`, `agent/agent_*.md` (flat, free-form).
- Real (private) variants: `*.local.md` — gitignored, same schema as the committed examples.
