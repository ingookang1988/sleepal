# architecture/ — ought × state (architecture norms) guide

> **Grid position:** ought × state. **Permission:** Schema (human only). *(New docs here may be authored by the agent as `tier: draft` with no approval — zero normative force until a human promotes them. [PRO-12])* **Change velocity:** near-immutable.

## What goes in
- Architecture rules: layer definitions, dependency direction, DDD/FSD boundaries.
- **Test strategy (tier 1):** the norms of "why & how we test." (tool *calling conventions* go to
  `.union-stack/reference/contracts/`; a runnable asset's *usage contract* goes to `.union-stack/reference/tools/`)
- Cross-cutting norms: *principles* of security/observability (concrete impl goes to code/contracts).
- The ZFS naming convention itself.

## What stays out
- Concrete types/signatures → `.union-stack/reference/contracts/` (contract).
- The actual current code structure → `.union-stack/verification/derived/state`.
- Anything that is "this is how it is" rather than "this is how it ought to be" belongs elsewhere.

## Core distinction
- architecture = *norms* ("the domain must not import infrastructure").
- A norm violation yields "bad code"; a contract violation yields "code that doesn't run." Don't mix them.

## Subfolder — infra/ (infrastructure NORMS only)
- `infra/` holds `INF-*`: deployment/DB/test-infra *decisions & rationale* (ought). Schema tier.
- ⚠️ Norms only — tooling call-conventions → `reference/contracts`, current state → `verification/derived/state`. See `infra/_GUIDE.md`.

## Files
- `ARCH-00_zfs_naming.md` — the ZFS naming convention (this template's core norm)
- `ARCH-01_example_layers.md` — dummy layer rules
- `infra/INF-*` — infrastructure norms (subfolder)
