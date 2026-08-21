<!-- 방법론 자산 카드(leakage-guard METHODOLOGY 등재) — 시나리오 층의 첫 카드. [PRO-10] -->
---
id: TOOL-17
title: 결함 수정(Defect Correction) 시나리오
kind: scenario
impl: .claude/skills/defect-correction/SKILL.md
version: 1
status: Draft
activation: manual
entry_gate: node scripts/check-prereqs.js
exit_criteria: node scripts/health.js
reviewed: 2026-07-25
evidence: []
---

# [TOOL-17] 결함 수정 시나리오

## 용도
실패가 존재하고 원인이 미상일 때의 절차(재현→최소화→기원추적→격리→수정→회귀고정). ISO/IEC 14764 *corrective*에 대응하며 절차는 Zeller TRAFFIC + 델타 디버깅을 따른다.

## 언제 쓰나
관측된 동작이 기대와 어긋나고 **재현이 가능하거나 확보 가능할 때**. 즉 *실패는 있는데 원인을 모르는* 상태에서 진입한다. 이 레포 실측상 이 유형은 12건/2세션, 도구 **집합** 동형성 0.80(n=9)으로 절차가 비교적 안정적이다 — 초기 보고치 1.00(n=8)은 서브에이전트 호출이 누락된 계측 결과였고, 코퍼스를 전 프로젝트로 넓히면 0.39다([ADR-16]).

## 언제 쓰지 않나
- **재현이 불가능**할 때 — 추측 수정은 이 시나리오의 실패 모드다. 중단하고 인간에게.
- 요구가 **동작 변경**일 때(→ 기능 추가), 동작 보존한 **구조 변경**일 때(→ 구조 리팩토링).
- 환경만 바뀐 이행 작업(→ 적응 이행).

## 호출
```bash
node scripts/check-prereqs.js     # 진입 게이트(exit≠0이면 진입 불가)
# 절차 본문: .claude/skills/defect-correction/SKILL.md
node scripts/health.js            # 종료 조건
```
- `status: Draft` — **A/B 근거가 `evidence[]`에 들어오기 전까지 Active로 승격하지 않는다.**
