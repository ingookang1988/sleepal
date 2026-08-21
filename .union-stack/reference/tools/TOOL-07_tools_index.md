<!-- 방법론 자산 카드(leakage-guard METHODOLOGY 등재) — 이 템플릿이 실제로 배송하는 도구. -->
---
id: TOOL-07
title: tools-index 컴파일러 (상시 주입 카탈로그 인덱스)
kind: script
impl: scripts/tools-index.js
status: Active
version: 1.0
---

# [TOOL-07] tools-index 컴파일러

## 용도
TOOL 카드들의 한 줄 요약 인덱스를 생성해 AGENTS.md 마커 블록에 주입한다(온디맨드 미호출 문제의 해법 — 인덱스는 항상 보여야 작동).

## 언제 쓰나
- TOOL 카드를 추가/수정/삭제한 직후 `--write`. 기본 모드(check)는 lint 체인에서 드리프트를 잡는다.

## 언제 쓰지 않나
- AGENTS.md 인덱스 블록의 **손 편집** — 생성물이므로 반드시 이 스크립트로.

## 호출
```bash
node scripts/tools-index.js          # check: 인덱스 ↔ 카탈로그 일치 검사(드리프트 게이트)
node scripts/tools-index.js --write  # AGENTS.md 블록 재생성
```
