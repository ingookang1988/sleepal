<!-- [Schema/ought] The ZFS naming norm. This file is methodology, so it is fine to publish/use as-is. -->
---
id: ARCH-00
title: ZFS naming convention
status: Active
version: 1.0
---

# [ARCH-00] ZFS (Zettelkasten File System) naming convention

## Filename formula
`[DOMAIN]-[LUHMANN_ID]_[slug].md`  — e.g. `PLAN-01a1_example_oauth.md`

## Rules
1. **DOMAIN**: 2–6 uppercase letters. A **closed whitelist** (enforced by `VALID_DOMAINS` in `scripts/zfs_util.js`):
   `ARCH INF PHASE CON PLAN MTG ANL FLOW WO WF LSN DOM TOOL EVD ADR PRO`. New domains are added to both code and docs only after `.union-stack/proposals` approval.
2. **LUHMANN_ID**: starts with a digit. Digit blocks and letter blocks alternate as it grows.
   Letters exclude **`l`/`o`** → `[a-km-np-z]` (blocks confusion with digits 1/0).
   A terminal task ends with `-[0-9]+`.
3. **slug**: snake_case starting with a lowercase letter. No spaces, hyphens, or uppercase.

## Deep linking
No relative paths. Reference only via bracket IDs like `[PLAN-01a1]` in body text → a global regex index.

## Lineage inference
- **Upward Fetching**: trim from the terminal to reverse-derive parents. `01a1-2`→`01a1`→`01a`→`01`.
  Automated: `node scripts/upward-fetch.js <ID>` — gathers parent PLAN/FLOW/CON/ARCH (space)
  and same-lineage LSN (time-axis pitfalls).
- **Blast Radius**: on edit/delete, index the descendants of the same lineage; if a Verifying
  node exists, Fail-close. (the alternation rule keeps `01a1` from mistaking `01a10` for a child)
  Automated: `node scripts/blast-radius.js <ID>` — exits 1 if a locked node exists.

## ID space — single and shared, with known aliasing ([ADR-25])
- The Luhmann coordinate space is **one space shared across domains** — same id in different
  domains = same lineage. That is the design (`CON-01a` ↔ `PLAN-01a`), not an accident.
- **Counter domains** (`TOOL`, `PRO`) allocate ids serially, *without* lineage intent. They therefore
  alias coordinates: `blast-radius TOOL-10` and `PRO-10` return the same impact set even though
  `TOOL-10` (smell linter) is unrelated to lineage 10 (measured 2026-08-18).
- **Ruling: the single space stays; no code split.** A domain-level rule cannot separate true coupling
  from false — `PRO-10 → WO-10a-1` is an intended edge while `TOOL-10 → WO-10a-1` is noise, and both
  ends live in counter domains. The discriminator is intent, which ID arithmetic cannot see; encoding
  intent would replace lineage inference (this file's core mechanism) with declared edges.
  `upward-fetch` is already immune via its `CONTEXT_DOMAINS` whitelist.
- **Discipline**: when anchoring a new lineage root, know that the low-number band is occupied by
  counters. Exposure is watched, not gated: `health.js` `lock exposure` (a false lock needs a
  `Verifying` doc in the aliased lineage — 0 today).
- **Reopen**: an actually observed false lock or GC block reopens the split proposal, with that
  incident as evidence.

### ADR bands — one per lineage (2026-08-22)
`ADR` is a **counter domain**, so two sessions working different lineages in parallel both take
"the next number" and collide. That is not hypothetical: on 2026-08-22 the face session and the
body session each appended what was then numbered 49–53, and five ids resolved to two decisions
apiece. (Those ids no longer exist — both sets were migrated into bands; see below.)
A counter cannot be made safe by convention alone once writers are concurrent — **split the range**:

| Band | Lineage |
|---|---|
| **101–199** | 얼굴/폰 (`01b`) — P1 하드웨어–표정 파트(H)의 얼굴측 결정도 여기 |
| **201–299** | 몸통 (`01d`) |
| **301–399** | 그 외 · 하네스 · 공통 셸(`02a`) · 놀이(`02b`) |
| **401–499** | 트래킹 앱 (`02c` `02d` `02e`) — added 2026-08-22, 인간 승인. 파트 T 전용([PLAN-02] §경계 3) |

> 3번째 팀원이 `02b`를 맡아 301–399의 동시 쓰기가 실제로 발생하면, 위의 기존 규칙대로
> **next free band(501–599)를 `02b`에 할당**한다 — 대역 분리의 기준은 계보가 아니라 *동시 쓰기 주체*다.

- **06–42 are retired** — template guides cite them as upstream ids; reusing them would make those
  dangling refs resolve to unrelated entries.
- **43–58 → 101–111** (face) and **49–53 → 201–205** (body). No entry sits outside a band.
- Allocate from **your lineage's band only**, and take the max within that band + 1. The rule is
  restated in `archive_ledger.md`'s header, which is where an allocator actually looks.
- **Re-read before appending.** The collision was not a numbering bug — it was two writers holding
  a stale view of an append-only file. Bands shrink the blast radius; they do not remove the need
  to re-read. A new lineage takes the next free band.

> The verified regex & decision logic live in `scripts/zfs_util.js`, tests in `scripts/zfs_util.test.js`.
> The index layer is `scripts/zfs_index.js`.
