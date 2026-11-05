---
id: WO-02d-1
title: 모드 상태 머신 — PLAY→WIND_DOWN→SLEEP→WAKE
status: Active
parent: PLAN-02
evidence: "scripts/mode-core.test.js 8/8(가상 시계 전이 시나리오) · 헤드리스 통합 게이트 18/18(Playwright, 2026-11-05 — 모드→눈 유도·R4·히스테리시스·센서 부재·R3) · 실기 자동 전환 1회는 미실측(Closed 조건)"
closed_by: []
---
# [WO-02d-1] 모드 상태 머신

**선행 [WO-02a-2] · [CON-02] Draft 합의.** [PLAN-02] §3·§5 의 전환 조건을 구현한다. 눈 5상태(보드 연결 시 보드 소유)와 다른 층이다 — 모드는 폰이 소유하고, 표정·사운드가 [CON-02]로 구독한다. **2026-11-05 범위 변경(HISTORY · [ADR-401])**: 보드 미연결 시 모드가 눈 상태를 유도한다([CON-02] 규칙 4) — 이것이 "앱만으로 실제 작동"의 핵이다. 거치 자동 감지는 후속 WO 로 분리(시작 버튼 = 세션 시작).

## 목표
조도·수음 5분 히스테리시스 또는 명시 명령으로 4모드가 자동 전환되고, 전이가 [CON-02] 이벤트로 발행된다.

## 수용 기준
- [x] `mode.js` + `mode-core.mjs`(순수 핵, T 소유) — 단일 상태 보유 · 전이 규칙: 어둠 1분 → WIND_DOWN · 어둡고 조용 5분 → SLEEP · 밝고 소리 5분 → WAKE · 명령(`play|windDown|sleep|wake`) 즉시. `sleepIntent`([WO-02b-1])는 `command('sleep')` 으로 들어온다
- [ ] **거치 감지 → PLAY 진입**([PLAN-02] §시연 1) — **후속 WO 로 분리**(2026-11-05). 지금은 시작 버튼이 `modeStart()`(권한 1회 + 조도계 + PLAY)
- [ ] **거치 이탈 → WAKE 신호 + [CON-03] `undock` 이벤트** — 후속 WO(거치 감지와 한 쌍). 사용자 음성 감지(`voice`)는 트래커([WO-02d-2])
- [x] 수음 = 귀 RMS(WIND_DOWN) 또는 T 수음 모노 RMS(SLEEP) — [CON-02] 규칙 5 · 조도 = 기존 lux 경로 재사용(카메라/보드)
- [x] 히스테리시스: 창 안에서 조건이 깨지면 타이머 리셋 — 게이트 "어둠 50초+밝음 1초+어둠 59초 → 아직 PLAY"
- [x] 전이마다 [CON-02] `mode:change` 발행 · 표정을 직접 조작하지 않는다 — 눈 유도는 소비자 `face/mode-eyes.js`(H, 규칙 4)
- [x] 가상 시계 검사 경로 — `SP._modeFeed(t, lux, snd)` · `SP._nightNow()` · `?nightS=` (node 8/8 + 헤드리스 18/18)
- [x] SLEEP/NIGHT 중 화면·발화·알림 0 — 밤에는 배경 #000·눈 숨김·표정 계산 정지·HUD 강제 OFF(게이트) · 모드 머신은 출력 경로가 없다
- [ ] **실기(폰 Chrome)**: 시작 → 불 끄고 조용히 5분 → 팰이 먼저 잠든다 1회 실측 + 상수(`?dark=&bright=&quiet=&noise=`) 튜닝 — **Closed 조건**

## 증거
- `node --test scripts/mode-core.test.js` 8/8 — 기본·진입·리셋·이탈·명령 우선·센서 부재·복귀·진행/상수.
- 헤드리스 통합 게이트(Playwright, `app/index.html` 실제 실행, 2026-11-05) 18/18 — 시작→PLAY/AWAKE · 어둠 60초→WIND_DOWN/DROWSY · 어둡고 조용 5분→SLEEP/ASLEEP(귀 OFF) · nightS→NIGHT(배경 #000·눈 숨김·X=null·HUD OFF) · 재진입 시 밤 타이머 재시작 · 밝고 소리 5분→WAKE/MORNING · WAKE 유지 · command→PLAY · 히스테리시스 리셋 · lux null 무전이 · snd null 조도 단독 · R3 얼굴 문자 0 · 키 r · 페이지 오류 0. 스크립트는 세션 스크래치(playwright 가 레포 의존성이 아니라 미커밋).
- 게이트가 잡은 부수 결함: `scripts/serve.js` 가 `.mjs` 를 octet-stream 으로 서빙해 PR #6 이후 얼굴이 모듈 로드 단계에서 통째로 안 떴다 — `.mjs` MIME 추가 + `serve.test.js` 회귀([ADR-307]).
- 미실측: 실기 자동 전환 1회(Closed 조건) · 카메라 AE 하의 `darkLux` 실값 · 귀/T 수음 전환.
