<!-- 방법론 자산 카드(leakage-guard METHODOLOGY 등재) — 외부 채택(adopt) 도구의 사용 계약. -->
---
id: TOOL-11
title: Repomix (레포 → 압축 컨텍스트 패킹) [adopt]
kind: cli
impl: npx:repomix
status: Active
version: 1.0
---

# [TOOL-11] Repomix

## 용도
레포 전체(또는 글롭 선택)를 단일 압축 파일로 패킹해 에이전트 컨텍스트로 공급한다(Tree-sitter 압축으로 토큰 ~-70%).

## 언제 쓰나
- 레포 *전역* 구조 분석·크로스 레포 비교 등 계보 단위를 넘는 조망이 필요할 때(토큰 예산을 명시하고).

## 언제 쓰지 않나
- 컨트롤 평면 조회 — Upward Fetching(TOOL-02)이 O(계보 깊이)로 더 싸고 정확하다. 전역 패킹은 예외 경로다.

## 호출
```bash
npx repomix --compress --include "src/**"   # 출력: repomix-output.xml
```
