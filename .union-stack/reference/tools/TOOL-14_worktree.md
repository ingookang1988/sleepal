<!-- 방법론 자산 카드(leakage-guard METHODOLOGY 등재) — 이 템플릿이 실제로 배송하는 도구. -->
---
id: TOOL-14
title: worktree 헬퍼 (계보 파티션 물리 격리)
kind: cli
impl: scripts/worktree.js
status: Active
version: 1.0
---

# [TOOL-14] worktree 헬퍼

## 용도
계보 서브트리별 git worktree(`../<repo>-wt-<id>`, 브랜치 `fleet/<id>`)를 생성/제거한다 — [PRO-05] "락이 아닌 파티션"의 물리 격리 수단.

## 언제 쓰나
- 플릿 모드에서 서브에이전트에 계보를 위임할 때(1 에이전트 = 1 서브트리 = 1 worktree).

## 언제 쓰지 않나
- 단독 세션의 일반 작업(불필요한 격리 — 그냥 main 워킹트리에서), 계보가 겹치는 작업(→ 직렬화/Fail-close).

## 호출
```bash
node scripts/worktree.js add WO-01a1-2   # 생성
node scripts/worktree.js list
node scripts/worktree.js remove WO-01a1-2
```
