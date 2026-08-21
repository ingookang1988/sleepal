# profile/human/ — user · team · org profiles (additive nested layers)

> SCIM-style split (RFC 7643): a minimal core **user**, a deliberately minimal **team**
> (displayName + members by *reference*), and an **org** layer that is additive — org fields
> never get baked into the user. Nesting is by reference: user ⊂ team ⊂ org.
> Tier: **Wiki** (each profile is owned by the person it describes). Real PII → `*.local.md` (gitignored).

## user schema (fields; all standards-backed)
| field | source precedent | meaning |
|---|---|---|
| `id`, `displayName` | SCIM | stable key · preferred display name |
| `nickName` | SCIM | the *casual* way to address ("Bob" not "Robert") |
| `honorificPrefix` | SCIM/CLDR | dedicated honorific field — never folded into the name |
| `preferredLanguage`, `locale`, `timezone` | SCIM (RFC 5646 / IANA) | language & locale |
| `verbosity` | agent-tools convention | concise / normal / detailed |
| `address` block | CLDR UTS#35 axes | see below — the 존댓말/호칭 model |
| `authority` | CODEOWNERS pattern | advisory only (owner / maintainer / contributor) |

## the `address` block (Korean honorifics — own vocabulary on CLDR axes)
No surveyed standard models 존댓말 natively, so union-stack defines the *values* and borrows the *axes*:
- `formality`: `formal` | `informal` (CLDR axis)
- `koreanSpeechLevel`: `하십시오체` | `해요체` | `반말` (own enum; 반말 covers 해체/해라체 colloquially)
- `usage_addressing`: how the agent *calls* the person (speaking TO — CLDR "addressing"/vocative)
- `usage_referring`: how the agent *mentions* the person (speaking ABOUT — CLDR "referring"/nominative)
- optional `호칭_map`: per-relationship forms of address (e.g. toward juniors vs seniors)

## team schema
`id`, `displayName`, `members[]` (user ids — by reference, never embedded), `overrides{}`
(team-level preference defaults; any user field may appear and is beaten by the user's own value).

## org schema
`id`, `displayName`, `teams[]` (by reference), `policy{}` (**guardrails — org-wins**, e.g. a language floor),
plus optional additive org-chart fields (`organization`, `division`, `department` — SCIM EnterpriseUser).

## Cascade reminder
Preference scalars: user > team > org. Objects deep-merge per key. `org.policy.*` inverts (org wins).
