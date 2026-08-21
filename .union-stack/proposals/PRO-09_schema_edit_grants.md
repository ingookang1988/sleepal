<!-- [Proposal] 승인 전 효력 없음. Schema 편집 권한 완화 + 상시 스탬프 제안. 예시(example) 값 포함. -->
---
id: PRO-09
title: Schema 편집 권한 — 인간 승인 시 에이전트 편집 허용 + 상시 스탬프(GRANT)
status: Approved
decided_by: human-architect (chat approval, 2026-07-24)
reason: "Schema read-only의 경직성을 소유자 재량으로 완화 — 인간 명시 승인 시 에이전트 편집 허용, 상시 스탬프로 반복 편집 시 재승인 생략. 감사·스코프·철회는 GRANTS.md로 보존. 신규 기둥/도메인 아님(기존 규칙·가드 확장)이라 split-principle 불요."
version: 1.0
---

# [PRO-09] Schema 편집 권한 완화 + 상시 스탬프

## 1. 동기
현행 선언은 "Schema = 에이전트 read-only, 인간만 편집"이지만, 실제로는 인간이 채팅으로 승인하면
에이전트가 편집하고 커밋에 `Approved-by:`를 남기는 관행이 이미 자리 잡았다(PRO-07·08·ADR-05~11 전부).
규칙과 관행의 괴리를 없애고, 반복 편집(예: 원장 축적, 특정 계보 집중 작업)에서 매번 재승인을 요구하는
마찰을 제거한다.

## 2. 규칙 변경 (승인 시 → AGENTS.md 규칙 2에 반영)
Schema는 **기본 read-only**이되, 에이전트는 다음 중 하나가 있으면 편집할 수 있고 커밋이 그 근거를 남긴다:
- **(a) 건별 승인** — 인간이 그 편집을 채팅에서 명시 승인 → `Approved-by: <이름>`.
- **(b) 상시 스탬프** — 경로가 `.union-stack/project/GRANTS.md`(인간 소유)의 행으로 커버됨 →
  `Approved-by: GRANT-id`로 **인용만 하고 그 스코프를 재승인 없이 계속 편집**.
둘 다 없으면 Fail-close. 규칙/규범 *변경* 자체는 여전히 `proposals/`를 거친다(스탬프는 파일을 만질 권한,
PRO는 규칙을 바꿀 결정 — 둘은 합성된다).

## 3. 강제 (permission-guard --strict)
- `readGrants`가 GRANTS.md의 `| GRANT-XX | <scope-glob> | ...` 행을 파싱(scope는 `.union-stack/`로 시작하는 것만).
- 에이전트 작성 Schema 변경: (a) GRANT-가 아닌 `Approved-by:` 값이 있으면 통과, 또는
  (b) 인용된 `GRANT-id`의 스코프가 그 경로를 **실제로 커버**하면 통과. 아니면 위반(인용했으나 스코프 밖도 위반).
- **자기부여 방지**: GRANTS.md 자체가 Schema(project/)라, 에이전트가 grant를 추가하려면 인간 승인이 필요하다.

## 4. 함께 정합 (부수)
`reference/domain/`은 가이드상 Schema로 선언돼 있었으나 permission-guard의 SCHEMA 분류·AGENTS.md 규칙 2
목록에서 누락돼 **강제되지 않고 있었다**(가이드 전수 점검에서 발견한 선언↔강제 드리프트). 규칙 2를 다시
쓰는 김에 SCHEMA 목록에 추가해 정합화한다.

## 5. 정직한 한계 (완화의 대가)
- Schema 소유권의 경직성을 일부 포기한다 — 이는 소유자(인간)의 의도된 트레이드오프다. 감사(트레일러)·
  스코프(글로브 최소)·철회(행 삭제)로 통제를 유지한다.
- 가드는 여전히 감사 게이트다: `agentAuthored`는 `Co-authored-by: claude`로 감지(스푸핑 가능), CI는
  기본 `--strict` 미포함(수동/로컬 검사). 즉 강제라기보다 *규율의 기계 보조*다([ADR-08] 권한 최소화와 정합).
- 넓은 스탬프(예: `.union-stack/**`)는 사실상 Schema 전면 개방 — 규율 1(스코프 최소)로만 억제되는 사회적 계약.

## 6. Split-principle
신규 기둥·도메인이 아니다(기존 규칙 완화 + 기존 가드 확장 + project/ 하위 파일 1개). 따라서 split-principle
검사 대상 아님. GRANTS.md는 project/ 거버넌스 산출물로 IDENTITY·roadmap·HISTORY와 같은 층위다.
