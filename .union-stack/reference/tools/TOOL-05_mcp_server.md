<!-- 방법론 자산 카드(leakage-guard METHODOLOGY 등재) — 이 템플릿이 실제로 배송하는 도구. -->
---
id: TOOL-05
title: 런타임 질의 MCP 서버 (읽기 전용 5종)
kind: mcp
impl: scripts/mcp-server.js
status: Active
version: 1.0
---

# [TOOL-05] 런타임 질의 MCP 서버

## 용도
plane 조회 5종(upward_fetch·blast_radius·where_to_record·zfs_lint·list_docs)을 에이전트 런타임 도구로 노출한다(zero-dep stdio JSON-RPC).

## 언제 쓰나
- 에이전트가 세션 중 plane을 질의할 때(등록: `.mcp.json`, 다른 도구는 같은 서버를 가리키면 됨).

## 언제 쓰지 않나
- **쓰기** — 노출 안 함(권한 tier·permission-guard 우회 방지). 편집은 파일 경로로.

## 호출
```bash
node scripts/mcp-server.js   # 보통은 .mcp.json 등록으로 클라이언트가 자동 기동
```
