<!-- 방법론 자산 카드(leakage-guard METHODOLOGY 등재) — 외부 채택(adopt) 도구의 사용 계약. -->
---
id: TOOL-12
title: ccusage (토큰·비용 회계) [adopt]
kind: cli
impl: npx:ccusage
status: Active
version: 1.0
---

# [TOOL-12] ccusage

## 용도
로컬 Claude Code 트랜스크립트(*.jsonl)에서 세션·일·월 단위 토큰 사용량과 비용을 집계한다.

## 언제 쓰나
- 효능 평가(E-시리즈)의 비용 축 실측 — 모델링 상수(재작업 토큰 등)를 실데이터로 교체할 때, 월간 사용 점검.

## 언제 쓰지 않나
- 행동 분석(도구 호출 패턴·의례 수행률) — transcript-stats(TOOL-09)가 담당. 이 도구는 회계 전용.

## 호출
```bash
npx ccusage            # 일별 요약
npx ccusage session    # 세션별
```
