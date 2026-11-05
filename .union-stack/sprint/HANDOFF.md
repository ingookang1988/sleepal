<!-- [Wiki] 세션 이어달리기. 세션을 마치는 에이전트가 덮어쓴다.
     ⚠ 이 문서는 **포인터만** 담는다. 어떤 사실도 여기에만 있어서는 안 된다 —
     latest-only 이고 손으로 덮어쓰므로 병렬 세션이 서로를 지운다(2026-08-22 실제 발생).
     세부는 소유 WO·평면 문서에 두고 여기서는 ID로 가리킨다. -->
# Handoff → next session

## 1. Summary
방향 전환(HISTORY 2026-11-05, 인간 승인): **보드 없이 폰 앱(PWA, 폰 Chrome 단독)만으로 "팰이 먼저 잠든다" 루프**가 돌도록 [WO-02d-1] 모드 상태 머신을 착수·구현했다 — `mode-core.mjs`(순수 핵)·`mode.js`(T 배선)·`face/mode-eyes.js`(모드→눈 유도, [CON-02] v0.2 규칙 4). 이어 UX 브리핑의 1·3·4·5번으로 [WO-01c-1] **케어 문장 띠 + 시작 화면 2단계**를 착수했다([ADR-123]) — `care-core.mjs`(사전 문장 16 + R2·R6 린트)·`care.js`. node 65/65 + 헤드리스 게이트 34/34. 게이트가 부수 결함을 잡았다: `serve.js` 가 `.mjs` 를 octet-stream 으로 서빙해 PR #6 이후 얼굴이 안 떴음([ADR-307], 수정). 앞선 작업: 하네스 상류 동기화 PR #9([ADR-305]·[ADR-306]) CI 그린, 머지 대기.

## 2. Changed locations (ID list)
- HISTORY 2026-11-05 행 · [CON-01] v0.5 · [CON-02] v0.2 · [WO-02d-1] Draft→Active · [WO-01c-1] Draft→Active · [ADR-401][ADR-307][ADR-123] 원장 append · `sprint/next.md` 재생성
- `app/care-core.mjs`·`app/care.js`(신규) · `scripts/care-core.test.js`(신규) · `app/index.html`(시작 화면 2단계·`#care`·BUILD 2026-11-05b) · `app/mode.js`(밤 에피소드·senseStart/senseQuery) · `scripts/mode-gate.js`(34 검사)
- `app/mode-core.mjs`·`app/mode.js`·`app/face/mode-eyes.js`(신규) · `app/main.js`·`app/hud.js`·`app/index.html`(BUILD 2026-11-05a)·`app/sw.js` · `scripts/serve.js`(.mjs MIME)·`scripts/serve.test.js` · `scripts/mode-core.test.js`(신규)
- (PR #9) 하네스 sync 67파일 · `adapter.json` · [WO-02f-2] 신설

## 3. Next task (single entry point)
**[WO-02d-1] 실기 검증(Closed 조건)** — 폰 Chrome 에서 `app/` 열고 "팰에게 방 보여주기" → 허용 → "시작" → 불 끄고 조용히 5분 → 팰이 먼저 잠드는지 1회 실측. 케어 띠가 "팰이 어둠에 눈이 익어가요 → 잠들려고 해요 → 잠들었어요"로 이유를 말하는지 함께 본다. HUD(`?dev=1`) 의 `mode` 줄로 후보/경과를 보며 상수(`?dark=&bright=&quiet=&noise=&sleepS=`)를 튜닝하고 실값을 [ADR-401] 후속 항목으로 남긴다. 통과하면 Closed + `feature/live.md` 행. 같은 실기에서 [WO-01c-1] 인간 R2 검수(LINES 16종 어감)도 끝낸다.

## 4. Open / cautions
- **배포 필요**: Railway PWA(`face-production-7605`)는 PR #6 이후 `.mjs` MIME 결함으로 얼굴이 안 뜨는 상태였다([ADR-307]). 이 브랜치 머지 후 `npm run deploy`(Railway 토큰 필요 — 인간)로 BUILD `2026-11-05a` 배포 + `deploy.js --check-only` 확인.
- 상수 기본값(dark 40 · bright 200 · quiet 0.05 · noise 0.12)은 **실측 전**이다. 카메라 조도계는 AE 때문에 절대값이 불안정 — 어두운 방에서 `lux.last` 가 실제로 `darkLux` 아래로 내려가는지가 첫 확인점. 폰이 몸통 안이면 후면 카메라가 안쪽을 본다(`lux.js` 주석) — 손에 들거나 협탁 거치로 먼저 검증.
- 귀(WIND_DOWN)와 T 수음(SLEEP)은 동시에 getUserMedia 를 열지 않도록 설계했으나 전환 순간의 실기 동작은 미검증. 마이크 거부 시 조도 단독 루프.
- 거치 자동 감지(충전 이벤트·devicemotion)는 후속 WO 로 분리 — 시작 버튼이 세션 시작. `feature/live.md` 는 실기 전이라 갱신하지 않았다.
- UX 브리핑(2026-11-05) 잔여: 세로 화면 눈 크기(2번) · 밤 두 손가락 탭 안전장치(7번) · 아침 보상 확장(6번은 회고 문장 1줄로 최소 해소). 케어 문장 어감은 인간 검수 대기([WO-01c-1] Closed 조건).
- [CON-01]·[CON-02] 편집 시 Verifying 자손 [WO-01b-5][WO-01b-6] 잠금 노출 — 인간 승인 하에 진행([ADR-401]). 그 WO 의 소유 세션은 계약 v0.5/v0.2 를 재확인할 것.
- 하네스: `weakening-guard.js` 로컬 포크([ADR-306]) 상류 제안 대기 · 상류 전용 스크립트 18개 동결(인간 결정) · review `_GUIDE` 5건 `--ack-review` 대기 · [WO-02f-2](밤샘, 보드 경로)는 보류.
- 회고 트리거 due(정체 WO 24·GC 가능 PLAN 1) — 회고 제안 — 정체 WO 24 ≥ 5.

## 5. Verification status
- root: `npm test` 65/65(mode-core 8 · care-core 5 · serve 15 포함) · `npm run lint` · `health` 전 게이트 · `weakening-guard` PASS · `permission-guard --strict`(HISTORY 편집은 Approved-by 트레일러).
- 헤드리스 통합 게이트 34/34(`scripts/mode-gate.js`, Playwright 필요). 미검증: **폰 실기 자동 전환** · 상수 실값 · 마이크 전환 · 권한 대화상자 실흐름(Permissions API 상태 매핑) · 케어 띠와 입의 실기 간격 · Railway 배포본.
