<!-- 방법론 자산 카드(leakage-guard METHODOLOGY 등재) — 이 템플릿이 실제로 배송하는 도구. -->
---
id: TOOL-16
title: session-friction (의도당 마찰 계측 · P₁ 탐지)
kind: cli
impl: scripts/session-friction.js
status: Active
version: 1.0
---

# [TOOL-16] session-friction

## 용도
사용자 발화 1건을 의도 1건으로 보고 다음 발화까지의 왕복 턴·토큰·도구 시퀀스를 집계해, 흡수 가치가 있는 **문제 후보(P₁)**를 비용 순으로 제시한다.

## 언제 쓰나
- 세션 종료 증류 루프의 P₁ 탐지, 그리고 승격 아티팩트의 전후 비교(EE 판정 분모).

## 언제 쓰지 않나
- **승격 근거로 단독 사용 금지** — 출력은 문제 후보이지 지식이 아니다(귀납은 P₁까지만). 추측(TT)과 가혹한 시험(EE)을 거치지 않은 승격은 실측상 순손해다.
- 의례 수행률·도구 빈도(→ TOOL-09), enforce 차단 경제(→ TOOL-15).

## 호출
```bash
node scripts/session-friction.js <transcript-dir>          # 기본: ~/.claude/projects
node scripts/session-friction.js <dir> --json
```
- 판정 규칙: **비용↑ + 동형성↑ + indep≥2**만 흡수 후보. 동형성이 낮으면 매번 다른 일(본질 작업량)이지 마찰이 아니다.
