<!-- 방법론 자산 카드(leakage-guard METHODOLOGY 등재) — E6 과제 스위트의 빌더/판정기. -->
---
id: TOOL-20
title: e6-workspace (과제 워크스페이스 빌더 + 숨은 오라클)
kind: cli
impl: scripts/e6-workspace.js
status: Active
version: 1.0
---

# [TOOL-20] e6-workspace

## 용도
`eval/e6-suite/`의 실결함을 **히스토리 없는 레포 사본**에 주입해 A/B 팔이 돌 작업 공간을 만들고, 팔 종료 후 **숨은 오라클**(원 수정 커밋의 회귀 테스트)로 정답 여부를 판정한다.

## 언제 쓰나
- E6 시나리오 A/B의 런 준비와 정답 판정(`eval/e6-suite/README.md` 운영 순서).

## 언제 쓰지 않나
- **일반 개발용 워크스페이스로 쓰지 말 것** — 결함이 주입되고 히스토리가 없는 평가 전용 사본이다. 계보 파티션 격리는 [TOOL-14] worktree.
- 절차 품질 판정(→ [TOOL-18]), 팔 비용 비교(→ [TOOL-19]).

## 호출
```bash
node scripts/e6-workspace.js list
node scripts/e6-workspace.js build  <D-id> <dest>   # 사본+결함 주입+커밋 1개 저장소, 발화 출력
node scripts/e6-workspace.js verify <D-id> <dest>   # 숨은 오라클 실행(exit 0 = 정답)
```
- `dest`는 **레포 바깥**이어야 한다(사본이 원본을 오염시킨다 — 빌더가 Fail-close).
- 결함 주입 지점이 정확히 1회 매칭되지 않으면 Fail-close한다(소스 드리프트를 조용히 넘기지 않는다).
- 오라클은 이 체크아웃의 테스트 파일이다 — build가 원본 HEAD를 찍으므로 드리프트를 확인할 수 있다.
