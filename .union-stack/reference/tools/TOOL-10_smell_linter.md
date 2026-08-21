<!-- 방법론 자산 카드(leakage-guard METHODOLOGY 등재) — 이 템플릿이 실제로 배송하는 도구. -->
---
id: TOOL-10
title: smell 린터 (카드 사용 계약 해부 검사)
kind: script
impl: scripts/smell-linter.js
status: Active
version: 1.0
---

# [TOOL-10] smell 린터

## 용도
TOOL 카드가 사용 계약의 최소 해부(용도·언제 쓰지 않나·호출·kind)를 갖추고 비대(>4KB)하지 않은지 Fail-close로 검사한다.

## 언제 쓰나
- TOOL 카드 추가/수정 후(lint 체인에 포함 — 커밋 전 자동).

## 언제 쓰지 않나
- 카드가 아닌 스킬/문서 일반 품질 평가(범위 밖 — 카탈로그 카드 전용).

## 호출
```bash
node scripts/smell-linter.js
```
