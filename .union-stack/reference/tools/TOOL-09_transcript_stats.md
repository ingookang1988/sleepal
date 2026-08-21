<!-- 방법론 자산 카드(leakage-guard METHODOLOGY 등재) — 이 템플릿이 실제로 배송하는 도구. -->
---
id: TOOL-09
title: transcript-stats (세션 관측 — 의례 자발 수행률)
kind: cli
impl: scripts/transcript-stats.js
status: Active
version: 1.0
---

# [TOOL-09] transcript-stats

## 용도
로컬 Claude Code 트랜스크립트(*.jsonl)에서 도구 호출 빈도와 **의례 자발 수행률**(첫 편집 전 upward-fetch/blast-radius 수행 비율 — E3 지표)을 측정한다.

## 언제 쓰나
- E3 도그푸딩 계측, 하네스 규칙 변경 전후의 행동 비교(관측 주도 하네스 진화).

## 언제 쓰지 않나
- 토큰/비용 회계(→ ccusage 계열이 담당 — 이 도구는 행동 분석 전용).

## 호출
```bash
node scripts/transcript-stats.js                      # 기본: ~/.claude/projects
node scripts/transcript-stats.js <dir> --json         # 특정 디렉터리, 기계 판독
```
