<!-- [Proposal] 승인 전 효력 없음. 횡단 관심사(보안·관측) 축 결정. 모든 ID·값은 가공 예시(example). -->
---
id: PRO-04
title: 횡단 관심사(보안·관측) — 신규 pillar 아님, concern 태깅 오버레이로 결정
status: Approved
decided_by: human-architect
reason: "DESIGN_RATIONALE §8.3(격자 완전성) 해소. 보안·관측은 분할원리 2차 검사 탈락(기존 칸에 들어감) → pillar 거부, concern: 태그 오버레이 채택."
version: 1.0
---

# [PRO-04] 횡단 관심사 축 — pillar가 아니라 태깅 오버레이

## 1. 배경 (해소 대상)
`DESIGN_RATIONALE.md §8.3`이 미결로 남긴 질문: *"2×3 격자가 완전한가, 혹은 보안·관측 같은 횡단
관심사가 제3 축으로 별도 차원이 필요한가."* 2026년 secure-by-default 흐름상 더는 미룰 수 없어 결정한다.

## 2. 분할원리(§1) 적용 — 신규 pillar 자격 검사
신규 pillar는 두 조건을 *모두* 만족해야 한다(§1.5, §8.3): **(a) "X 없는 시스템은 없다"** 그리고
**(b) "기존 칸 어디에도 안 들어간다."**

- (a) ✓ — 보안·관측은 모든 시스템에 존재한다.
- (b) ✗ — **기존 칸에 깔끔히 들어간다:**
  | 횡단 관심사의 면 | 거처(기존 칸) | 추상 레벨 |
  |---|---|---|
  | 보안/관측 *전략·규범* (예: "PII는 포트 경계에서만 로깅") | `architecture`(+`infra/INF-*`) | 당위 |
  | 보안 *계약* (예: 인증 토큰 타입·스코프 enum) | `reference/contracts/CON-*` | 계약 |
  | 보안/관측 *현실 관찰·드리프트* (예: 미인증 엔드포인트 발견) | `verification/derived/gap·state` | 실제 |
  | 보안 *결정* (예: 위협모델 채택) | `archive_ledger`(전술)·`project/HISTORY`(전략) | 시간 |
  | 반복된 보안 *함정* (예: 같은 SSRF 2회) | `reference/lessons/LSN-*` | 시간축 |

→ (b) 탈락. **신규 pillar 거부.** 새 칸을 만들면 같은 지식이 두 곳(보안-pillar ∥ architecture)으로
쪼개져 응집이 깨지고, 하네스가 막으려던 로드 노이즈를 자가 유발한다(§5.7 근접쌍 경계 논리와 동일).

## 3. 채택안 — `concern:` 프론트매터 태그 오버레이 (직교 축)
횡단 관심사는 *칸*이 아니라 *횡단 라벨*이다. 자산 민감도(§1.6)가 분류를 덮지 않고 *겹쳐서* 적용되듯,
관심사도 **기존 문서에 태그로 겹쳐** 단다. 어느 칸에 살든 관심사로 *조회*만 가능해진다.

- 표기(예시): 문서 프론트매터에 `concern: [security, observability]`.
- 효과: "보안 관련 전부 보여줘"가 칸을 가로질러 `grep`/색인으로 수렴 — pillar 없이 가시성 확보(§5.5 좌표화 철학과 동형: 강제가 아니라 가시성).
- 권한: 오버레이는 분류를 바꾸지 않으므로 각 문서의 기존 tier를 그대로 따른다.

## 4. 변경 영향 범위 (승인 시 구현 — 최소)
- 신규 도메인·디렉터리 **없음**(pillar 아님 → `VALID_DOMAINS`·linter·permission-guard **무변경**).
- `architecture/_GUIDE.md`·`verification/_GUIDE.md`에 "횡단 관심사는 `concern:` 태그로, 새 칸을 만들지 말 것" 1문장(**Schema → Approved-by**).
- (선택) `scripts/health.js`에 `concern` 태그 분포 INFO 차원 — 후속, YAGNI까지 보류.
- `DESIGN_RATIONALE.md §8.3` 항목을 "해소됨(PRO-04)"로 표시.

## 5. 결정
- → **승인**: 보안·관측은 pillar가 아니라 `concern:` 태그 오버레이. §8.3 종결.
- 기각이었다면 사유 보존(반복 제안 방지). 본 건은 승인이므로 위 4절을 최소 변경으로 반영한다.

> 이 결정 자체가 항목 7(기둥 증식 자기규율)의 *작동 예시*다 — pillar 후보를 분할원리로 *거부*한 첫 기록.
