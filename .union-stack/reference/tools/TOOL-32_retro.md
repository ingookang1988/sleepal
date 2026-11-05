<!-- 방법론 자산 카드(leakage-guard METHODOLOGY 등재) — 이 템플릿이 실제로 배송하는 도구. -->
---
id: TOOL-32
title: retro (회고 트리거 — 지표 7 관측 · 회차 기록 초안)
kind: cli
impl: scripts/retro.js
status: Active
version: 1.0
---

# [TOOL-32] retro

## 용도
회고가 필요한지를 **파일과 git 날짜만으로** 잰다([up:PRO-25] ① v0.2): 발행 증분(직전 회고 기록 스냅샷 대비) · 보관 부채 · 정체 WO(비종결 + 마지막 커밋 ≥30일) ·
GC 가능 PLAN · 평면 지연(가장 낡은 평면 기준, 생성 뷰는 별도) · 증류 정체(마지막 LSN 갱신 이후 종결 수) · 원장 크기. 하나라도 임계를 넘으면 CLARIFY(회고 제안).
`health` 의 `retro due` 절이 같은 계산을 싣는다. `--record` 는 회차 기록 초안(frontmatter 스냅샷 + 체크리스트 8 + Δ)을 낸다 — 수행·보류는 사람이 채운다.

## 언제 쓰나
- `health` 가 `retro due` 를 WARN 으로 띄우면 → 에이전트는 HANDOFF §4 에 `--proposal` 한 줄만 쓴다([up:PRO-25] ②). 그 이상 하지 않는다.
- 사람이 "회고 열자"로 세션을 열면 → 진입점은 **직전 회고 기록**(ANL-00<x>) · `--record --write` 로 이번 회차 초안.
- 임계가 어답터 출하 주기와 안 맞으면 → `adapter.json retro: { issuance, archiveDebt, staleDays, staleCount, gcPlans, planeLagDays, distill, ledgerKb, off: [...] }`.

## 언제 쓰지 않나
- **회고 자체** — 판정(Verifying → Closed/Active)·PLAN GC 승인·LSN 승격은 사람. 이 도구는 WO 도 LSN 도 쓰지 않는다([up:ADR-12] 경계).
- **전사 기반 지표** — 세션 기록을 읽지 않는다. 전사가 있는 어답터의 E3·P₁ 는 별도 도구([up:TOOL-09]·[up:TOOL-16]).
- **차단** — REJECT 가 없다. 회고는 늦어도 흐름을 막지 않는다.

## 호출
```bash
node scripts/retro.js                    # 지표 7 + Δ: 0(사유 없음) / 3(회고 제안)
node scripts/retro.js --proposal         # HANDOFF §4 에 붙일 한 줄
node scripts/retro.js --record           # 회차 기록 초안(stdout) · --write 로 plan/analytics/ANL-00<x>_retro_<날짜>.md 생성(어답터는 --adopter → parent: up:PRO-25)
node scripts/retro.js --root <dir> --json
```
