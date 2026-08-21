# sprint/ — actual × action (current work) guide
> **Grid:** actual (observed) × action. **Permission:** Wiki. **Change velocity:** very frequent.
## Goes in: "what is being done." WO (work order) / WF (workflow) documents + HANDOFF.
## Stays out: planning intent (→ .union-stack/plan), finished decisions (→ archive_ledger).

---

## WO — the work order document ([PRO-15])

> **`status:` in frontmatter is the single source of truth.** `next.md` is a *generated view* of it —
> never encode the lifecycle in two places (same rule as `plan/_GUIDE`: duplication → drift).

### Anatomy (4 required elements — enforced the way `smell-linter` enforces TOOL cards)
`## 목표` · `## 수용 기준` · `## 증거` sections, plus frontmatter `parent:`.
```yaml
status: Draft | Active | Verifying | Closed
parent: PLAN-01a
evidence: "<test/artifact/commit>"  |  "none — <이유>"   # 빈 값 금지
closed_by: []                                            # 상위 축 흔적(파일 경로)
```

### Budget: 1,500 tok — and what an overrun *means*
Same quantum as a scenario body and HANDOFF (no third number). Per [PRO-13], an overrun is a **routing
failure, not a size problem**: decisions → `archive_ledger`, pitfalls → `lessons`, contracts → `CON-*`,
process narrative → drop it (git has it). And note the second reading:
**if WOs habitually approach the cap, the work is too big — split the WO, don't shrink the doc.**

### Closing a WO — the work-exit ritual (mirror of Upward Fetching)
A WO is not closed by declaring it closed. Two facts must be checkable in the diff:
1. **A trace on a parent axis** (`closed_by:` ≥ 1) — `feature/live.md` · `verification/derived/{state,gap}.md`
   · `CON-*`. `work-close` verifies the file *actually* references the lineage, catching "declared but not applied."
2. **Evidence stated** (`evidence:`) — a value, or `none — <이유>`. Distinguishing *forgot* from
   *not applicable* is the whole requirement (the `— 해당 없음` trick from [PRO-13]).

```bash
node scripts/work-close.js WO-01a-1        # 점검 (CLARIFY only — never blocks)
node scripts/work-close.js --table --write # 작업대 뷰 재생성
```
At **session end**, move Closed WOs to `archived/` and regenerate the view. Closed WOs are **never
deleted** — they keep `plan/_GUIDE`'s GC condition ("every successor is terminal") computable.

> **prev.md is not revived** — see below. The rolling window was removed, not automated.

---

## HANDOFF.md — the session relay (agent-generated)

> The period of a session and the comma to the next. The *fast time-axis* linking session to session.
> (cf. .union-stack/reference/lessons/ is the repeated pattern across many sessions = the slow time-axis)

### Who / when
- The **agent ending a session** writes it, organizing its own work (Wiki atomic write).
- On the next session's bootstrap it is read **first**, right after project (identity).
- **Fleet ([PRO-06]):** when sub-agents run as a team, the **lead alone** writes HANDOFF — sub-agents
  return structured results to the lead. HANDOFF is latest-only, so a single author avoids contention.

### Volatile — only the latest one is valid
- Overwrite `HANDOFF.md` at the end of each session. **No rolling copy** — the previous version is already
  in git history (`git show HEAD~1:.union-stack/sprint/HANDOFF.md`), so a `prev.md` would duplicate the
  fact and drift. (Pre-2026-07 guidance said to roll one into `prev.md`; no session ever did, and the file
  never existed — the discipline was removed rather than automated.)
- Not for permanent retention. Once the next session reads it, its role is done.
- Lasting lessons are promoted separately to .union-stack/reference/lessons/, decision records to archive_ledger.

### Session history — where it lives (don't accumulate a giant log)
- **git history is the session archive.** HANDOFF is latest-only, not a log — past sessions are
  recovered from commits, so HANDOFF stays small (avoids the 70KB-sessions.md trap).
- Want a human-readable running log? Append session summaries to `.union-stack/verification/raw/` (append-only),
  NOT to HANDOFF. Promote anything lasting to lessons/archive_ledger.

### Authoring discipline (the agent must follow)
1. **A format a machine can pick up.** No prose diary. Structured items stamped with ZFS IDs.
2. **Changed locations as an ID list.** Not prose but `[WO-01a-2] [FLOW-01a]` style.
   The next agent runs Upward Fetching on those IDs to restore context itself.
3. **Extreme compression.** Don't explain everything. Point *exactly to where to look*.
4. **Next task as a single entry point.** One clear "start from [WO-01a-3]".
5. **Blockers/cautions stated separately.** Open issues and pitfalls as distinct items (so the next session doesn't fall in again).

### The 5 mandatory parts (miss any one and the relay fails)
- Session summary (1–3 lines) · changed locations (ID list) · next task (single entry point) · open/caution · verification status (did tests pass)
- An empty part must say `— 해당 없음` explicitly (distinguishes "not applicable" from "forgot to write").

### Routing decision tree + budget ([PRO-13] — token bloat is a routing failure, not a size problem)
Per item, first match wins:
1. Re-derivable from git/code/plane docs? → **don't record** (process narrative, attempt logs, raw tool output)
2. Strategic pivot + reason? → `project/HISTORY.md`  3. Decision + rationale? → `archive_ledger.md`
4. Pitfall repeated ≥2 in a lineage? → `reference/lessons/`  5. Harness rule change? → `proposals/`
6. Not-yet-started queue? → `next.md`  7. Needed by next session's bootstrap? → **HANDOFF, as ID pointers only**
8. None of the above → drop it. "Feels wasteful" is not a reason.

Compression rules: pointer over copy · measurements = number + one repro command · discussions = one
conclusion line + one why line · an item surviving 3 sessions in HANDOFF is misrouted (promote or drop).

> **"Don't re-propose X" does NOT belong in HANDOFF** ([PRO-14]·[ADR-18]). It reads like rule 7
> ("needed by the next session's bootstrap"), but HANDOFF is latest-only and hand-copied — an item
> that must survive *every* future session cannot live in a file each session overwrites. Put the
> `blocks:`/`reopen_when:` fields on the decision itself (ledger entry or `PRO-*` frontmatter);
> `blocks-index` compiles them into the AGENTS.md block. Copying the list back into HANDOFF
> re-creates the drift this rule removed.
Budget 1,500 tok — `node scripts/handoff-linter.js` surfaces overruns as CLARIFY (**never blocks** — an
imperfect HANDOFF beats a lost one; unresolved findings appear at the next session's bootstrap).
