<!-- [Proposal] 승인 전 효력 없음. agent-team 리소스 + 플릿 오케스트레이션 의례 제안. ID·값은 가공 예시. -->
---
id: PRO-06
title: agent-team 리소스 + 계보-파티셔닝 오케스트레이션 — sub-agent 레이어 운영
status: Approved
decided_by: human-architect
reason: "agent-team 리소스(SCIM-Group + lead) + 계보-파티셔닝 오케스트레이션 의례 승인. PRO-03 §5 이월 회수, PRO-05 동시성 재사용, 신규 도메인·게이트 0(profile/agent 셀 확장)."
version: 1.0
---

# [PRO-06] agent-team 리소스 + 플릿 오케스트레이션 의례

> [PRO-03] §5가 "agent-team/org 전용 리소스 = 후속 PRO"로 명시 이월했고, `profile/agent/_GUIDE.md`
> "Agent teams / orgs (future)"가 *SCIM-Group형 리소스를 새 proposal로 추가(임베드 금지)*하도록 규정했다.
> 본 제안이 그 후속이다. 동시성 의미론은 **[PRO-05]를 재사용**하고, 본 PRO는 (a) 팀의 *구조적 표현*과
> (b) 리드→서브에이전트 *위임 플레이북* 두 빈칸만 채운다.

## 1. 제안 요지
`profile/agent/`가 현재 **단일 에이전트 카드**만 모델링한다. 2026 worktree-플릿 표준 아래 *팀*을 운영하려면
빠진 두 조각을 채운다:
- **구조**: SCIM-Group형 `agent-team` 리소스(멤버십·리드·팀 단위 오버라이드) — `human/team`과 대칭.
- **오케스트레이션**: 리드 에이전트가 작업을 **ZFS 계보 서브트리로 분해해 서브에이전트에 위임**하는 의례.
  위임 1차 축 = **[PRO-05]의 파티션 키(한 에이전트 = 하나의 계보 서브트리)**. 새 메커니즘을 만들지 않는다.

## 2. Split-principle 점검 (anti-bloat — 신규 pillar/domain 아님 확인)
- **신규 pillar/domain 아님.** 기존 `profile/agent/` 셀(Wiki·비-ZFS 평탄 레지스트리)을 *확장*하고,
  기존 `AGENTS.md` 작업-진입 의례에 한 절을 *덧댄다*. 새 도메인·게이트·스크립트 0.
- 테스트 (b) "기존 셀에 들어가는가" = **예** → pillar가 아니라 기존 셀 확장. (a) "모든 시스템에 X 결여" 무관.
- 즉 본 PRO는 [PRO-04](기각된 pillar=overlay 판정)의 규율을 통과한다 — 격자를 늘리지 않는다.

## 3. 제안 — agent-team 리소스 (SCIM-Group 패턴, 값은 가공 예시)
`human/team`과 동일 구조 + 오케스트레이션용 `lead` 필드 하나 추가.
```yaml
# profile/agent/team_example.md (더미 — example 마커)
id: team-example
displayName: 예시 빌드 플릿
lead: agent-example          # 오케스트레이션 진입점(리드 에이전트, members 중 하나)
members:                     # 참조만 — agent_* id, 임베드 금지(SCIM)
  - agent-example
  - 예시-builder-agent
overrides:                   # 팀 단위 interactionStyle 기본값 — 멤버 자신의 값이 이김(user-wins류)
  formality: formal
  verbosity: concise
authority: "팀 단위 작업 분해·위임은 리드 단독, Schema·proposals 승격은 인간 승인"   # advisory only
```
- `members[]`는 **참조**(에이전트 카드 id). 멤버 카드를 임베드하지 않는다(SCIM Group 규율).
- `overrides{}`는 팀 기본 선호 — 캐스케이드는 기존과 동일: 멤버 자신 > 팀 > org, `org.policy.*`만 org-wins.
- `lead`는 *서술적 진입점*일 뿐, 집행은 플랫폼(Claude Code `Agent`/subagent_type) 몫 — 본 평면은 spawn하지 않는다.

## 4. 제안 — 플릿 오케스트레이션 플레이북 (위임 = 계보 파티셔닝)
리드 에이전트가 따르는 의례. **[PRO-05] 동시성 규칙을 그대로 전제**하고 *위임 절차*만 추가한다.
1. **분해**: 작업을 ZFS 계보 서브트리로 쪼갠다. *한 서브에이전트 = 하나의 서브트리*(예: A는 `01a*`, B는 `02*`).
   계보가 겹쳐 분할 불가하면 → 직렬화하거나 **인간에 에스컬레이트(Fail-close)**. 임의 동시 편집 금지.
2. **진입(서브에이전트별)**: 자기 서브트리 루트로 `node scripts/upward-fetch.js <루트ID>`(부모 맥락+계보 lessons)
   → `node scripts/blast-radius.js <루트ID>`(잠금 Verifying/Live 노드 있으면 침범 금지, Fail-close).
3. **격리/병합**: 각자 worktree에서 작업(PRO-05). append 평면=union merge, Wiki 평면=frontmatter version OCC.
4. **수렴(HANDOFF 단일화)**: 서브에이전트는 *파일이 아니라 구조화 결과*를 리드에 반환. `sprint/HANDOFF.md`는
   latest-only Wiki라 다중 작성자 경합이 생기므로 → **리드가 통합 HANDOFF를 단독 작성**(다작성자 경합을
   구조적으로 회피). 변경위치 ID는 각 서브에이전트 계보를 합집합.
5. **잠금 규율**: 서브트리 검증 중(Verifying/Live)인 노드는 다른 에이전트의 작업 중 신호 → 침범 금지(2번 게이트).

## 5. 변경 영향 범위 (승인 시 구현 — 최소)
**새 파일(더미):**
- `profile/agent/team_example.md` (위 3절 스키마, `example` 마커 → init 자동 제거·leakage-guard 통과).

**기존 파일 갱신 (Wiki·가이드·엔트리 — Schema 아님):**
- `profile/agent/_GUIDE.md` — "Agent teams / orgs (future)" 절을 *확정*으로 전환: team 스키마 표 + `lead` 설명.
- `AGENTS.md` 작업-진입 의례(§Upward Fetching)에 "플릿이면 4절 플레이북: 리드가 계보로 분해→위임,
  서브에이전트는 자기 서브트리로 upward-fetch+blast-radius, HANDOFF는 리드 단독 작성" **1문단**(PRO-05 1문장과 인접).
- (선택, 이월) `sprint/_GUIDE.md` — HANDOFF 단일-작성자 규율 1줄.

**코드/게이트:** **변경 없음.** 신규 도메인·스크립트·health 차원 0(`blast-radius.js`·`upward-fetch.js` 재사용).

**검증:** `zfs-linter`·`leakage-guard`·`permission-guard`·`history`·`ref --strict`·`context-budget`·`health` 전 게이트 그린 + 테스트 0 fail.

## 6. 정직한 한계 (비범위)
- **런타임 분산락 없음**(PRO-05 계승): version OCC는 *탐지*이지 *예방* 아님. 1차 방어는 계보 분할(만나지 않기).
- **본 평면은 에이전트를 spawn하지 않는다.** team 리소스·`lead`·플레이북은 전부 *서술적*. 실제 sub-agent 기동은
  플랫폼(Claude Code `Agent` 툴/subagent_type, Workflow)이 한다 — union-stack은 *파티셔닝 규율 + 팀 레지스트리*만 제공.
- `authority` 필드는 advisory(CODEOWNERS 패턴) — 집행은 플랫폼 hooks/permissions. RBAC 엔진 아님.
- 팀 단위 health 지표(멤버수·계보 커버리지)는 **YAGNI까지 이월** — 증거가 정당화하기 전엔 차원을 늘리지 않음.

## 7. 결정
- → **승인(2026-06-17, human-architect).** 5절을 구현: `profile/agent/team_example.md` 신설,
  `profile/agent/_GUIDE.md`(team 스키마표+`lead`)·`AGENTS.md`(§Upward Fetching 플릿 오케스트레이션 문단)·
  `sprint/_GUIDE.md`(HANDOFF 단일-작성자 1줄) 갱신. 신규 도메인·게이트·스크립트 0.
- 전 게이트 그린 + 테스트 0 fail로 검증.
