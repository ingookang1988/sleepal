<!-- 방법론 자산 카드(leakage-guard METHODOLOGY 등재) — 이 템플릿이 실제로 배송하는 도구. -->
---
id: TOOL-04
title: Health 조견표 (게이트 + 구조 지표)
kind: script
impl: scripts/health.js
status: Active
version: 1.0
---

# [TOOL-04] Health 조견표

## 용도
전 게이트 상태(naming·history·leakage·크기·ref·context budget·잠금 노출)와 구조 지표(도메인 분포)를 한 번에 보고한다.
관측 4절(plane sync·lessons lifecycle·**effect surface**·tier distribution)은 전부 INFO — 판정·점수를 만들지 않는다([PRO-11] §4).
`effect surface`는 평면 밖 권한 allowlist(`.claude/settings*.json`)를 계수한다 — 비가역 외부 효과의 유일한 통제면이라 관측만 붙였다([ADR-23]).

## 언제 쓰나
- 세션 마무리·커밋 전 자기 점검, 하네스 구조 변경 직후.

## 언제 쓰지 않나
- 단일 게이트만 볼 때(각 린터를 직접 — 더 빠르고 exit 코드가 명확).

## 호출
```bash
node scripts/health.js
```
