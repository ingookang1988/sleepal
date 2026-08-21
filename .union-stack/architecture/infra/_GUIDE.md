# architecture/infra/ — infrastructure NORMS (ought only)

> **Layer:** a sub-area of `architecture` (ought × state). **Permission:** Schema (human only, agent read-only).
> **Change velocity:** near-immutable. Infra is broadly architecture — but only its *norms/decisions* live here.

## What goes in (norms · decisions only — "this is how infra ought to be")
- Deployment architecture decisions (e.g. "deploy via Kubernetes; envs = dev/stage/prod") + rationale.
- DB choice and its *rationale* ("Postgres because X"), data-layer boundary principles.
- Test-code-infrastructure *strategy* (the why/where, at the norm level).

## ⚠️ What stays out (route to its real home — do not duplicate here)
- Test runner/fixture/mock **calling conventions** → `.union-stack/reference/contracts/` (CON-00 catalog). Already has a home.
- A reusable **script/skill/MCP tool's usage contract** (when to run it, when not) → `.union-stack/reference/tools/` (`TOOL-*`).
- Concrete DB **schema/types** (a contract) → `.union-stack/reference/contracts/`.
- **Current** deployed state · DB migration status (observed reality) → `.union-stack/verification/derived/state`.

> The split mirrors the whole template: ought(norms) ≠ contract(interfaces) ≠ actual(state).
> Folding all "infra" into one place would re-merge those three — exactly what the grid avoids.

## Files
- `INF-*` (ZFS). e.g. `INF-01_example_deploy.md`
