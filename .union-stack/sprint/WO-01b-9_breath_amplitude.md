<!-- [Wiki] 작업 지시. 상태 정본은 이 frontmatter `status:` 하나뿐이다([up:PRO-15]). scaffold 생성 — 선택 절(배경·설계·절차)은 필요할 때만 추가. -->
---
id: WO-01b-9
title: 호흡 진폭 상태별 — 후광과 같은 깊이로 (ANL-01b 후보 4)
status: Verifying
parent: PLAN-01b
evidence: "face-gate 호흡 p2p AWAKE 1.80 · DROWSY 2.70 · ASLEEP 3.15mm · 확산지 뒤 인간 확인 대기"
closed_by: []
version: 1.0
---
# [WO-01b-9] 호흡 진폭 상태별 — 후광과 같은 깊이로 (ANL-01b 후보 4)

## 목표
[ANL-01b] 근인 3(후보 4). 호흡 진폭이 상태와 무관하게 ±2%(눈 높이 p2p 1.8mm)이고 감긴 눈 곡선은 ×0.3(0.6mm)이라, 후광(보드)은 숨쉬는데 얼굴은 멈춘 것처럼 읽힌다. [CON-01] 호흡 **주기**는 이미 상태별이다 — **진폭**도 상태별로 맞춘다.


## 수용 기준
- [ ] `BREATH_AMP` 상태별(AWAKE 2% · DROWSY 3% · ASLEEP 3.5% · MORNING 2% · NIGHT 0) — `expression()` 이 `breathMm` 을 돌려준다
- [ ] 감긴 눈(ASLEEP ⌣ 곡선)은 breathMm 그대로(×0.3 폐기) — p2p ≥ 2.5mm
- [ ] 주기는 [CON-01] BREATH 그대로(위상 0 = 상태 진입) — 보드 후광과 어긋나지 않는다
- [ ] 10m 가독성은 [WO-01d-3] 확산지 뒤 인간 평가(여기서는 수치만)

## 증거
- `scripts/face-gate.js` — 호흡 p2p AWAKE 1.80 · DROWSY 2.70 · ASLEEP 감긴 곡선 3.15mm(이전 0.6).
- 주기는 [CON-01] BREATH 그대로(위상 0 = 상태 진입) — 코드 경로 불변.
- 인간 확인(Closed 조건): [WO-01d-3] 확산지 뒤에서 후광과 얼굴이 한 호흡으로 읽히는지.
