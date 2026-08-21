<!-- 방법론 자산 카드(leakage-guard METHODOLOGY 등재) — 이 템플릿이 실제로 배송하는 도구. -->
---
id: TOOL-03
title: Blast Radius (영향권 + 잠금 Fail-close)
kind: script
impl: scripts/blast-radius.js
status: Active
version: 1.0
---

# [TOOL-03] Blast Radius

## 용도
노드의 모든 자손(영향권)을 나열하고, Verifying 자손이 있으면 Fail-close(exit 1)한다.

## 언제 쓰나
- 컨트롤 평면 노드를 **편집/삭제하기 전** 항상. 플릿 모드에선 서브트리 소유권 확인용([PRO-05]).

## 언제 쓰지 않나
- 읽기 전용 조회(→ TOOL-02 upward-fetch가 맥락 수집 담당).

## 호출
```bash
node scripts/blast-radius.js PLAN-01a
```
- exit 1 = 잠금 자손 존재 — 멈추고 인간 확인. 같은 로직: `/blast-radius`, MCP `blast_radius`, PreToolUse 훅.
