<!-- [Wiki] 작업 지시. 상태 정본은 이 frontmatter `status:` 하나뿐이다([up:PRO-15]). scaffold 생성 — 선택 절(배경·설계·절차)은 필요할 때만 추가. -->
---
id: WO-01b-8
title: 졸림의 연속성 — mode:progress 점진 졸림 · DROWSY 표류 · 꾸벅 (ANL-01b 후보 2·3)
status: Verifying
parent: PLAN-01b
evidence: "face-gate(표류 0.16mm · 꾸벅 · k→윗꺼풀) · probe DROWSY 표류 0→0.23mm · 실기 5분 세션 확인 대기"
closed_by: []
version: 1.0
---
# [WO-01b-8] 졸림의 연속성 — mode:progress 점진 졸림 · DROWSY 표류 · 꾸벅 (ANL-01b 후보 2·3)

## 목표
[ANL-01b] 근인 2·4(후보 2·3). 졸림이 이진이다 — WIND_DOWN 진입에 DROWSY 로 한 번 바뀌고 5분 동안 "점점 더 졸려"가 없다. DROWSY 의 표류가 0 이라 깜빡임 사이 4~5초가 완전 정지(죽은 눈). [CON-02] `mode:progress`(SLEEP 후보 경과율)를 얼굴이 **연속 표정 변조**로 소비한다 — 상태 전이는 없다([CON-01] 규칙 2).


## 수용 기준
- [ ] `expression.js` 가 `mode:progress` 를 구독해 k = elapsed/need(SLEEP 후보만, 0~1)를 보유. 후보 리셋·모드 전이 시 0
- [ ] DROWSY 에서 k 에 따라 눈꺼풀 목표 +0~0.2 · 깜빡임 재개 시간 +0~0.4초 · 표류 0.3→0.15. 전이는 유발하지 않는다
- [ ] **꾸벅(nod)** — DROWSY 에서 8~16초 뒤 첫 꾸벅, 이후 12~20초 간격(k 가 클수록 잦음). 봉투: 천천히 더 감김(1.1초) → 머묾 → 홱 뜸(0.25초), 눈이 1.5mm 가라앉음
- [ ] DROWSY 표류 > 0(계측) · AWAKE/MORNING 표류 불변
- [ ] ASLEEP·NIGHT 에서 꾸벅·k 무효(R4 이중 방어) · 보드 연결 시에도 안전(진행 이벤트 없으면 k=0)

## 증거
- `scripts/face-gate.js` — DROWSY 표류 0.16mm(이전 0) · 45초 안 꾸벅 1회(정점 윗꺼풀 +0.35 · 눈 1.42mm 가라앉음) · `mode:progress` 50% → k 0.5 → 윗꺼풀 +0.10 · `mode:change` → k 0 · ASLEEP 무효.
- `scripts/expr-probe.js` 전/후: DROWSY driftAmpMm 0.00 → 0.23 · 깜빡임 길이 1.44 유지.
- 실기·인간 확인(Closed 조건): 실제 5분 세션에서 눈꺼풀이 점점 내려오는 것이 10m 에서 읽히는지 · 꾸벅 빈도(8~16초, 이후 12~20초×(1−0.5k))가 과하지 않은지.
