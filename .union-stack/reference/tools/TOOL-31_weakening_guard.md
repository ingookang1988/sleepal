<!-- 방법론 자산 카드(leakage-guard METHODOLOGY 등재) — 이 템플릿이 실제로 배송하는 도구. -->
---
id: TOOL-31
title: weakening-guard (약화 표면화 질문 + 예외 목록 증가 red)
kind: cli
impl: scripts/weakening-guard.js
status: Active
version: 1.0
---

# [TOOL-31] weakening-guard

## 용도
범위 diff 에서 **검사를 약하게 만드는 변경**을 찾아 질문 한 줄씩 낸다([up:PRO-22] §3 단계 3 — CLARIFY, 차단 아님): 테스트 파일 삭제 · skip/only 추가 ·
단언 순감 · 스냅샷 갱신(줄 수가 아니라 **변경 필드 종류**) · 러너 설정 변경 · 테스트의 숫자 리터럴 변경. 활성 WO evidence 에 `weakening: <사유>` 가 있으면
통과(INFO) — 사유 있는 약화는 결정이다.
단계 4 는 **ⓑ 예외 목록이 base 대비 늘면 red**: skip/only · `eslint-disable` · `@ts-ignore/@ts-expect-error` · `noqa` · `nolint` · allowlist/holdout/baseline 파일 항목.
늘어난 만큼 `adapter.json checks[].known_failures: [{id, reason, owner, until}]` 가 덮어야 하고(id 가 추가 줄에 보여야), **만료(until < 오늘)는 REJECT**.
ⓐ(WO 자동 등재)를 택하지 않은 이유: 에이전트가 평면에 WO 를 쓰는 루프라 [up:ADR-12] 경계에 닿는다.

## 언제 쓰나
- CI 체인([up:TOOL-27])의 한 단계 — `permission-guard` 다음. 로컬에선 커밋 전 `node scripts/weakening-guard.js`.
- 예외를 늘려야 할 때 → `known_failures` 에 소유자·만료일과 함께 등록(만료일만 연장되는 것을 막는 꼴은 "red" 뿐이라는 하류 3/3 답).

## 언제 쓰지 않나
- **테스트가 옳은지 판정** — 줄 패턴만 본다. 삭제가 정당한지, 숫자 완화가 실제 완화인지는 질문으로 돌린다(`--contract` scope).
- **약화 신호 차단** — 절대 REJECT 로 승격하지 않는다(차단이면 우회만 는다). REJECT 는 예외 증가·만료뿐.
- **git 없는 환경의 판정** — diff 를 못 얻으면 CLARIFY(관측 불가 ≠ 통과). `--diff <file>` 로 unified diff 를 넣을 수 있다(팔·테스트).

## 호출
```bash
node scripts/weakening-guard.js                  # 작업트리 vs HEAD: 0 / 3(질문) / 1(예외 증가·만료)
node scripts/weakening-guard.js --range A..B     # CI 범위
node scripts/weakening-guard.js --diff d.diff    # unified diff 파일
node scripts/weakening-guard.js --json           # 기계 판독 (--contract 로 계약 출력)
```
