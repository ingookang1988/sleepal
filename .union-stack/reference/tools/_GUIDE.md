# tools/ — reusable executable assets catalog (the fourth reference member)

> **Position:** a member of `reference/` (consult-before-act knowledge). [PRO-08]
> contracts = agreed truth · lessons = experience-justified truth · domain = domain truth ·
> **tools = usage contracts of executable assets** ("don't rebuild a capability that already exists — find and run it").
> **Permission: Wiki** (agent row-level atomic writes). Register/update freely; retire via proposals.

## What goes in
- One `TOOL-*` doc per reusable asset: repo scripts, agent skills, MCP tools, CLI helpers.
- **Catalog-only**: the doc holds a pointer + usage contract — purpose, inputs/outputs, when to use,
  when NOT to use, invocation snippet. The implementation stays at its real home
  (`scripts/`, `.claude/`, `.mcp.json`); never duplicate code into the plane.
- Required frontmatter: `impl:` — repo-relative path of the implementation. Enforced by
  `node scripts/tool-linter.js` (Fail-close: missing field or dangling path = violation).
  For assets without a single file (e.g. an MCP tool), point to its registration surface (e.g. `.mcp.json`).
- **Adopted external assets** (not shipped in this repo): `impl:` takes `npx:<package>` (external CLI)
  or `https://...` (server/repo reference); mark the title with `[adopt]`. The linter checks the form,
  not remote existence — the card's usage contract is the whole point of adopting.

## ⚠️ What stays out (route to its real home)
- The implementation itself → `scripts/` etc. (this plane is pointers, not code)
- Types / interfaces the tools consume → `reference/contracts/`
- Pitfalls hit while using a tool (repeated 2–3×) → `reference/lessons/`
- One-off throwaway experiments → `spike/` (a tool earns a TOOL-* card only once it is *reused*)

## Discipline
- **Register only what exists**: create the implementation first, then the card (`impl:` must resolve).
- Keep each card short (the invocation snippet is the longest part) — cards are injected context.
- **Instrument self-contamination** — check this *before* writing any measuring tool ([ADR-07]·[ADR-19];
  observed 3×, most recently within minutes of building [TOOL-22]). In a repo whose subject matter *is* its own
  vocabulary, a string-matching instrument counts the repo's documentation as data: a doc explaining a marker
  syntax is also a source of that syntax. Scan **execution surfaces only** (tool names, shell commands, skill
  args) — never document prose — and exclude fenced blocks and inline code spans. A first measurement that
  looks clean is the symptom, not the proof: `transcript-stats` read 100% before the fix and 0% after.

## Files
- `TOOL-*` (ZFS). e.g. `TOOL-01_example_zfs_linter.md`
