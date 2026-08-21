<!-- 방법론 자산 카드(leakage-guard METHODOLOGY 등재) — 이 템플릿이 실제로 배송하는 도구. -->
---
id: TOOL-15
title: hook-replay (enforce 경제성 사전 측정)
kind: cli
impl: scripts/hook-replay.js
status: Active
version: 1.0
---

# [TOOL-15] hook-replay

## 용도
과거 실제 편집을 PreToolUse 결정 함수에 재생해 "enforce를 켰다면 무엇이 몇 번 막혔을까"를 훅 설치 없이 측정한다(차단율·유형·대상).

## 언제 쓰나
- enforce 전환을 검토할 때(E3), 권한 규칙·잠금 상태를 바꾼 뒤 그 영향 추정.

## 언제 쓰지 않나
- 오탐/정탐 *판정* — 도구는 빈도와 대상만 준다. 판정은 인간이 목록을 보고 한다.

## 호출
```bash
node scripts/hook-replay.js <transcript-dir>   # 기본: ~/.claude/projects (레포 밖 경로는 자동 제외)
node scripts/hook-replay.js <dir> --json
```
