<!-- 방법론 자산 카드(leakage-guard METHODOLOGY 등재) — E6 리그의 품질 판정기. -->
---
id: TOOL-18
title: scenario-rubric (시나리오 A/B 품질 비악화 루브릭)
kind: cli
impl: scripts/scenario-rubric.js
status: Active
version: 1.0
---

# [TOOL-18] scenario-rubric

## 용도
런(=세션) 1개의 도구 호출 **순서**에서 결함수정 절차의 관측 가능한 두 지점을 판정한다 — ①재현 선행(첫 편집 이전 실행) ②회귀 고정(테스트 파일 편집 + 이후 실행). E6 성공 바의 AND 절반인 *품질 비악화*를 기계로 낸다.

## 언제 쓰나
- 시나리오 A/B 팔의 품질 판정([TOOL-19]가 자동 호출한다). 단독으로는 한 팔의 궤적 감사.

## 언제 쓰지 않나
- **게이트 그린 확인 대체 금지** — 종료 코드를 보지 않는다("실행했다"까지만 안다). 그린은 팔 종료 후 워크스페이스에서 `node scripts/health.js`로 따로 확인.
- **최소성 pass/fail 판정 금지** — 절대 임계값이 없어 편집 파일·호출 수는 *팔 간 비교 수치*로만 낸다.
- 의례 수행률(→ [TOOL-09]), 마찰 기준선(→ [TOOL-16]).

## 호출
```bash
node scripts/scenario-rubric.js <arm-transcript-dir>
node scripts/scenario-rubric.js <dir> --json
```
- **런 = top-level 발화가 있는 세션.** 서브에이전트 전사는 런이 아니라 부모 런의 작업으로 합류한다(파일 1개=런 1개로 세면 편집 0건짜리 가짜 런이 분모에 낀다).
- 실행 표면만 본다(도구 이름·셸 명령·편집 경로) — 편집 *내용*은 매칭하지 않는다([ADR-07] 계측 오염 방지).
