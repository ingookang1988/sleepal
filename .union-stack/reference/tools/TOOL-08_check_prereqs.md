<!-- 방법론 자산 카드(leakage-guard METHODOLOGY 등재) — 이 템플릿이 실제로 배송하는 도구. -->
---
id: TOOL-08
title: check-prereqs (단계 진입 전제 게이트)
kind: script
impl: scripts/check-prereqs.js
status: Active
version: 1.0
---

# [TOOL-08] check-prereqs

## 용도
작업 진입 전 필수 산출물을 Fail-close로 검사한다 — 부트스트랩(IDENTITY·HANDOFF 5부) + 작업 ID의 계보 전거(PLAN/CON/ARCH 존재).

## 언제 쓰나
- 구현 시작 직전(특히 새 세션 첫 작업), 플릿 리드가 서브에이전트에 계보를 위임하기 전.

## 언제 쓰지 않나
- ID 없는 자유 탐색(spike는 전거가 없어도 됨 — 그게 spike의 정의).

## 호출
```bash
node scripts/check-prereqs.js WO-01a1-2   # ID 생략 시 부트스트랩 산출물만 검사
```
- exit 1 = 전제 미충족 — PLAN을 먼저 쓰거나 spike로.
