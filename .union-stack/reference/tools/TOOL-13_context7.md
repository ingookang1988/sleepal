<!-- 방법론 자산 카드(leakage-guard METHODOLOGY 등재) — 외부 채택(adopt) 도구의 사용 계약. -->
---
id: TOOL-13
title: Context7 MCP (최신 라이브러리 문서 주입) [adopt]
kind: mcp
impl: https://github.com/upstash/context7
status: Active
version: 1.0
---

# [TOOL-13] Context7 MCP

## 용도
작업 중인 외부 라이브러리의 *현행 버전* 공식 문서·코드 예시를 MCP로 주입해 구식 API 환각을 막는다.

## 언제 쓰나
- 제품 코드가 외부 라이브러리/프레임워크 API를 다룰 때(버전 명시와 함께).

## 언제 쓰지 않나
- 이 하네스 자체 작업(제로 의존성 — 외부 라이브러리가 없다), 도메인 지식 조회(→ reference/domain).

## 호출
```jsonc
// .mcp.json 에 추가(사용자 승인 후):
// "context7": { "command": "npx", "args": ["-y", "@upstash/context7-mcp"] }
```
