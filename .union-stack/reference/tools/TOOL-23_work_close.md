<!-- 방법론 자산 카드(leakage-guard METHODOLOGY 등재) — 이 템플릿이 실제로 배송하는 도구. -->
---
id: TOOL-23
title: work-close (작업 종료 의례 — 진입 의례의 거울)
kind: cli
impl: scripts/work-close.js
status: Active
version: 1.0
---

# [TOOL-23] work-close

## 용도
WO를 닫을 때 상위 축 흔적(`closed_by`)과 증거(`evidence`)를 검사해 미충족을 CLARIFY로 표면화하고, `sprint/next.md` 작업대 뷰를 WO 문서에서 재생성한다([PRO-15]).

## 언제 쓰나
- WO 작업을 마쳤을 때 → `node scripts/work-close.js <WO-ID>`로 닫힘 조건 점검.
- WO를 새로 만들었거나 status를 바꿨을 때 → `--table --write`로 작업대 뷰 갱신.
- 세션 종료 시 → Closed WO를 `sprint/archived/`로 옮기고 뷰를 다시 갱신.

## 언제 쓰지 않나
- **작업이 정말 끝났는지 판정** — 이 도구는 흔적의 *존재*만 본다. 반영 내용이 옳은지, 수용 기준이 충족됐는지는 사람과 테스트의 몫이다(`--contract`의 scope 참조).
- **`next.md` 직접 편집** — 표는 파생 뷰다. 상태를 바꾸려면 WO 문서의 `status:`를 고친다(정본이 둘이면 드리프트).
- **흐름 차단** — REJECT를 내지 않는다. 불완전하게 닫힌 WO가 안 닫힌 WO보다 낫다([PRO-13] 동형 논리).

## 호출
```bash
node scripts/work-close.js WO-01a-1          # 닫힘 점검: 0(충족) / 3(CLARIFY, 비차단)
node scripts/work-close.js --table           # 작업대 뷰 드리프트 검사
node scripts/work-close.js --table --write   # next.md 마커 블록 재생성
node scripts/work-close.js WO-01a-1 --json   # 기계 판독 (--contract 로 계약 출력)
```

## 검사 항목
| 검사 | 판정 |
|---|---|
| `closed_by:` 비었음 | CLARIFY — 흔적 후보 제시 |
| `closed_by:`가 가리킨 파일에 그 계보 브래킷 참조 없음 | CLARIFY — **선언만 하고 반영 안 함** |
| `evidence:` 빈 값 | CLARIFY (`none — 이유`는 통과 — 미기입과 해당없음의 구별) |
| 부모의 자식 WO가 전부 Closed | 정보 — PLAN status 전이 **후보 제시**(강제 전이 없음) |
