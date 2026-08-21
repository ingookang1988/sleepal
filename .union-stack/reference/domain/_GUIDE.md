# domain/ — domain knowledge & models (the third reference member)

> **Position:** a member of `reference/` (consult-before-act knowledge).
> contracts = agreed truth · lessons = experience-justified truth · **domain = domain truth** (subject-matter models).
> **Permission:** Schema (human-owned, near-immutable subject-matter facts) — agent read-only.

## What goes in
- Domain models, formulas, theory, ontologies the product *encodes* but that are NOT governance,
  architecture norms, or type contracts. Often large reference docs an agent must consult before
  implementing domain logic.
- Examples: a pricing model, a medical scoring rubric, a legal ruleset, a math/tensor model.

## ⚠️ What stays out (route to its real home)
- How to build/run the project (governance) → `AGENTS.md`
- Code-structure rules (ought) → `.union-stack/architecture/`
- Shared types / interfaces / enums (contract) → `.union-stack/reference/contracts/`
- Current observed state → `.union-stack/verification/derived/state`

> This fills the grid's missing "domain knowledge" cell: it is neither ought, nor a type contract,
> nor process — it is *settled subject-matter truth you consult*, hence a reference member.

## Files
- `DOM-*` (ZFS). e.g. `DOM-01_pricing_model.md`
