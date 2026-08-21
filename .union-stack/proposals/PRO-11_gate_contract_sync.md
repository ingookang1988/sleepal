<!-- [Proposal] 승인 전 효력 없음. SPIKE-fdt_canon_import_utility_analysis 부분 채택(C1·C3·C2축소). 예시(example) 값 포함 — 종료코드 매핑·지표명은 승인 시 확정. -->
---
id: PRO-11
title: 게이트 계약 선언+4값 결과 · 동기화 관측 계기 · LSN 수명 표면화 (SPIKE-fdt 부분 채택)
status: Approved
decided_by: ingookang1988 (chat approval, 2026-08-10)
reason: "SPIKE-fdt 부분 채택 — 이 저장소에서 진단이 재현되는 C1·C3·C2축소만. 승인 조건: 차단 정책(REJECT만 차단, CLARIFY/HOLD 비차단)은 선택이 아니라 계약이며, session-friction 비회귀를 수용 기준으로 유지."
version: 1.0
---

# [PRO-11] 게이트 계약 + sync 관측 + LSN 수명 표면화

## 1. 요지
`spike/SPIKE-fdt_canon_import_utility_analysis.md`의 후보 중 **이 저장소에서 진단이 재현되는 3건만** 채택한다.
- **C1** 게이트 계약 선언 + 4값 결과 — D3이 이 저장소에서 실측됨(게이트 5종 전부 exit 0/1 이진).
- **C3** 동기화 관측 계기 — 평면 정지를 감지할 장치가 템플릿에 없음(운용 인스턴스 1건에서 9주 정지 실측).
- **C2 축소형** — LSN이 이미 가진 `status`·`valid_reason` 필드를 읽는 게이트가 없음. 필드 신설은 하지 않는다.

C4·C6은 이 저장소에 근거 실측이 없어 **기각 아닌 보류**(해당 사고가 실측되면 재론 — 거부 기록 보존 원칙).

## 2. 정본 정박과 신분
- C1은 정본 [GRAM-12c] `accepted`에 정박: `PASS | HOLD | CLARIFY | REJECT` + 계약 필드. **꼴만 반입** — 각 게이트의 predicate·authority 값은 하네스가 정의([LSN-05]류 격리).
- C2 틀의 [MECH-12]는 `proposed`이므로 **인용만 하고 정박하지 않는다.** 정박은 `accepted`인 [AXIOM-13](수명·supersededBy)에 한정.

## 3. 변경 내용
1. **게이트 5종**(zfs-linter·history-linter·permission-guard·leakage-guard·health)에 `--contract` 플래그: input/predicate/scope/outcome을 JSON으로 선언. 종료 코드 분리 — `0` PASS · `1` REJECT · `2` HOLD · `3` CLARIFY. AGENTS.md 규칙 1([PRO-07])이 산문으로 이미 구별하는 "질문하고 진행"(CLARIFY)과 "정지"(REJECT)를 도구 값으로 표현하는 것.
   - **차단 정책 (본 제안의 존재 이유)**: 흐름을 중단시키는 것은 **REJECT 하나뿐**이다.
     `HOLD`는 대기열 기록, `CLARIFY`는 **질문을 병기하고 진행**([PRO-07] 실측 규율의 도구화) —
     CI·훅은 exit 2·3을 실패로 처리하지 않는다(annotation으로 표면화). 이 매핑을 빠뜨리고
     "nonzero=실패"로 배선하면 4값 도입이 오히려 차단을 **늘리므로**, 이 항은 선택이 아니라 계약이다.
     현행이 과잉 차단(모든 위반=exit 1=정지)이므로, 본 제안은 게이트 강화가 아니라 **차단 축소**다.
2. **`health.js`에 `sync` 절**: 평면 파일(gap/state/evidence/live)별 최종 기입 날짜와 ledger 증가분을 **병치만** 한다. 판정·점수 없음.
3. **`health.js`에 `lessons` 절**: LSN의 `status`·`valid_reason`을 읽어 `조건부/만료후보 LSN: N` 표면화.
4. **CI**(`harness.yml`)가 게이트 결과를 `verification/raw/evidence.md`에 append — 기존 선언("시스템만 Append")의 이행.

## 4. 수용 기준
- **동기화 "점수"·"측도" 신설 금지** — 정본 [AXIOM-27]이 실측 전 측도 정의를 명시 금지. 관측 병치까지만.
- E6 리그(`eval/PROTOCOL.md`)에서 채택 전/후 1회 비교(게이트 오독·stale 인용 지표).
- **마찰 비회귀**: `session-friction.js`의 의도당 왕복 비용이 채택 후 악화되지 않아야 한다.
  악화되면 차단 정책 매핑부터 의심한다(게이트 자체보다 배선 오류가 먼저).

## 5. 반증 조건 (SPIKE 원문 승계)
- C1: 계약 선언 후에도 게이트 오독 사고 발생 → 결함은 선언 부재가 아니라 판독 규율 → 철회.
- C3: sync 표면화 후에도 평면이 계속 정지 → 문제는 가시성이 아니라 평면 자체의 필요성 → 평면 폐기 재론.

## 6. Split-principle check
(a)/(b) 해당 없음 — 신규 기둥·도메인 없음. 기존 스크립트 확장 + health 지표 추가뿐.
