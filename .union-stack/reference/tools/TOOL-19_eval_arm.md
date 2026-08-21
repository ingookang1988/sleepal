<!-- 방법론 자산 카드(leakage-guard METHODOLOGY 등재) — E6 시나리오 A/B의 실행 리그. -->
---
id: TOOL-19
title: eval-arm (시나리오 A/B 팔 집계·비교 + 성공 바 판정)
kind: cli
impl: scripts/eval-arm.js
status: Active
version: 1.0
---

# [TOOL-19] eval-arm

## 용도
두 팔의 전사 디렉터리를 받아 런별 비용(의도당 턴·출력 토큰)을 내고, 델타 + 소표본 유의성(Mann–Whitney U 정확 임계표) + 품질 비악화([TOOL-18])를 합쳐 **E6 성공 바를 기계로 판정**한다.

## 언제 쓰나
- `eval/PROTOCOL.md` §3-bis의 A/B 1사이클 판정. 팔은 **top-level 세션**으로, 팔마다 **격리된 전사 디렉터리**에서 돌린 뒤 이 도구로 비교한다(격리 수단: [TOOL-14] worktree — 워크스페이스가 갈리면 전사 디렉터리도 갈린다).

## 언제 쓰지 않나
- **과거 실측 기준선을 팔 ①로 쓰지 말 것** — ①도 같은 과제 스위트로 재실행한 디렉터리여야 한다. 자연 작업 분포와 통제 과제는 난이도가 달라 델타가 시나리오 효과인지 과제 차인지 분리되지 않는다.
- **서브에이전트로 돌린 팔 금지** — sidechain 발화는 의도를 열지 않아 팔의 의도가 0건이 되고 토큰만 부모에 가산된다.
- 자연 세션의 P₁ 탐지(→ [TOOL-16]).

## 호출
```bash
node scripts/eval-arm.js <arm1-dir(①무시나리오)> <arm2-dir(②강제)> --n 5
node scripts/eval-arm.js <a1> <a2> --json     # exit 0 = 성공 바 pass
```
- 판정: (턴 **또는** 토큰의 유의미 감소) **AND** 품질 비악화. `pass`일 때만 델타를 카드 `evidence[]`에 `{eval_run, delta, n, date}`로 고정하고 `status: Draft → Active`.
- 유의성은 등표본 n=4~10 정확 임계표(양측 α=.05)만 판정하고 그 밖은 보류(null)한다. 런당 의도가 2건 이상이면 분모 오염 경고를 낸다(1과제=1발화).
