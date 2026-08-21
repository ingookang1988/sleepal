# profile/agent/ — agent profiles (declarative card)

> Pattern borrowed from the A2A protocol's **Agent Card** (a declarative JSON "digital business
> card" — name, description, version, provider). union-stack borrows the *structure* only; this is
> not an A2A-compatible artifact. Tier: **Wiki**. Flat registry, not ZFS.

## agent schema
| field | source precedent | meaning |
|---|---|---|
| `name` | A2A Agent Card | display name of the agent |
| `description` | A2A | human-readable purpose/capabilities |
| `version` | A2A | profile version |
| `provider` | A2A | `{organization, url}` — who operates the agent |
| `interactionStyle` | own | `{formality, language, verbosity, …}` — how the agent speaks by default |
| `authority` | CODEOWNERS pattern | advisory scope of what the agent may decide alone |

## Agent teams (SCIM-Group resource) — [PRO-06]
Beyond `provider.organization` (the A2A grouping hook), real agent-team semantics live in a
**SCIM-Group-style resource** (`team_*.md`): members by *reference*, never embedded.

| field | source precedent | meaning |
|---|---|---|
| `id`, `displayName` | SCIM Group | stable key · team display name |
| `lead` | own (orchestration) | the lead agent (one of `members`) — the delegation entry point |
| `members[]` | SCIM Group | agent card ids, **by reference** (embedding a card is a defect) |
| `overrides{}` | own | team-level `interactionStyle` defaults — beaten by the member's own value |
| `authority` | CODEOWNERS pattern | advisory scope (e.g. "lead alone decomposes/delegates") |

`lead` is a *descriptive* entry point only — this plane does NOT spawn agents; the platform
(Claude Code `Agent` tool / subagent_type / Workflow) does. The fleet **orchestration ritual**
(lead decomposes work by ZFS lineage → delegates one subtree per sub-agent) lives in `AGENTS.md`
§Upward Fetching; concurrency/merge semantics are [PRO-05].

## Interplay with human profiles
The acting agent reads the active **user** profile and adapts (존댓말 level, 호칭, tone). The agent's
own `interactionStyle` is the *default* that the user profile overrides — user-wins, same cascade.
