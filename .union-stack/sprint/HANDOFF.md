<!-- [Wiki] 세션 이어달리기. 세션을 마치는 에이전트가 덮어쓴다.
     ⚠ 이 문서는 **포인터만** 담는다. 어떤 사실도 여기에만 있어서는 안 된다 —
     latest-only 이고 손으로 덮어쓰므로 병렬 세션이 서로를 지운다(2026-08-22 실제 발생).
     세부는 소유 WO·평면 문서에 두고 여기서는 ID로 가리킨다. -->
# Handoff → next session

## 1. Summary
방향 전환(HISTORY 2026-11-05, 인간 승인): **보드 없이 폰 앱(PWA, 폰 Chrome 단독)만으로 "팰이 먼저 잠든다" 루프**가 돌도록 [WO-02d-1] 모드 상태 머신을 착수·구현했다 — `mode-core.mjs`(순수 핵)·`mode.js`(T 배선)·`face/mode-eyes.js`(모드→눈 유도, [CON-02] v0.2 규칙 4). 이어 UX 브리핑의 1·3·4·5번으로 [WO-01c-1] **케어 문장 띠 + 시작 화면 2단계**를 착수했다([ADR-123]) — `care-core.mjs`(사전 문장 16 + R2·R6 린트)·`care.js`. node 66/66 + 헤드리스 게이트 42/42. 잔여 2·7번(세로 갸웃 신호 · 밤 두 손가락 길게)도 [ADR-124]로 닫았다. 게이트가 부수 결함을 잡았다: `serve.js` 가 `.mjs` 를 octet-stream 으로 서빙해 PR #6 이후 얼굴이 안 떴음([ADR-307], 수정). PR #9(하네스 동기화 + 위 전부)는 **main 에 머지됨**(`fc3aebb`, 2026-11-05). 머지 후 표정 동작을 헤드리스로 계측해 [ANL-01b]에 남겼고(PR #10 머지), 개선 후보 1~7을 **[WO-01b-7]~[WO-01b-10] 4건으로 발행·구현**했다([ADR-125]) — 다중 슬롯 크로스페이드·점진 졸림+꾸벅·호흡 진폭·sad/curious 가독성·fx 페이드·startled 통일. emotion-core 6/6 · face-gate 15/15 · mode-gate 42/42. 4건 모두 Verifying(인간 미적 확인이 Closed 조건).

## 2. Changed locations (ID list)
- HISTORY 2026-11-05 행 · [CON-01] v0.5 · [CON-02] v0.2 · [WO-02d-1] Draft→Active · [WO-01c-1] Draft→Active · [ADR-401][ADR-307][ADR-123][ADR-124] 원장 append · `sprint/next.md` 재생성
- `app/face/emotion-core.mjs`(신규) · `app/face/expression.js`·`fx.js`·`app/main.js`(표정 WO 4건) · `scripts/emotion-core.test.js`·`scripts/face-gate.js`(신규) · [WO-01b-7][WO-01b-8][WO-01b-9][WO-01b-10] 신설(Verifying) · [ADR-125] · BUILD 2026-11-05d
- `app/care-core.mjs`·`app/care.js`(신규) · `scripts/care-core.test.js`(신규) · `app/index.html`(시작 화면 2단계·`#care`·BUILD 2026-11-05b) · `app/mode.js`(밤 에피소드·senseStart/senseQuery) · `scripts/mode-gate.js`(34 검사)
- `app/mode-core.mjs`·`app/mode.js`·`app/face/mode-eyes.js`(신규) · `app/main.js`·`app/hud.js`·`app/index.html`(BUILD 2026-11-05a)·`app/sw.js` · `scripts/serve.js`(.mjs MIME)·`scripts/serve.test.js` · `scripts/mode-core.test.js`(신규)
- (PR #9) 하네스 sync 67파일 · `adapter.json` · [WO-02f-2] 신설

## 3. Next task (single entry point)
**[WO-02d-1] 실기 검증(Closed 조건)** — 선행: Railway 재배포(위 §4 첫 항목). — 폰 Chrome 에서 `app/` 열고 "팰에게 방 보여주기" → 허용 → "시작" → 불 끄고 조용히 5분 → 팰이 먼저 잠드는지 1회 실측. 케어 띠가 "팰이 어둠에 눈이 익어가요 → 잠들려고 해요 → 잠들었어요"로 이유를 말하는지 함께 본다. HUD(`?dev=1`) 의 `mode` 줄로 후보/경과를 보며 상수(`?dark=&bright=&quiet=&noise=&sleepS=`)를 튜닝하고 실값을 [ADR-401] 후속 항목으로 남긴다. 통과하면 Closed + `feature/live.md` 행. 같은 실기에서 [WO-01c-1] 인간 R2 검수(LINES 16종 어감)도 끝낸다.

## 4. Open / cautions
- **배포 대기(인간)**: Railway PWA(`face-production-7605`)는 PR #6 이후 `.mjs` MIME 결함으로 얼굴이 안 뜨는 상태였다([ADR-307]). main 머지는 됐으나 **재배포는 아직** — 클라우드 세션에는 railway CLI·토큰이 없고 배포 호스트가 프록시에서 막힌다. 로컬에서 `node scripts/deploy.js -p <projectId>`(BUILD `2026-11-05c`) 후 `--check-only`.
- 상수 기본값(dark 40 · bright 200 · quiet 0.05 · noise 0.12)은 **실측 전**이다. 카메라 조도계는 AE 때문에 절대값이 불안정 — 어두운 방에서 `lux.last` 가 실제로 `darkLux` 아래로 내려가는지가 첫 확인점. 폰이 몸통 안이면 후면 카메라가 안쪽을 본다(`lux.js` 주석) — 손에 들거나 협탁 거치로 먼저 검증.
- 귀(WIND_DOWN)와 T 수음(SLEEP)은 동시에 getUserMedia 를 열지 않도록 설계했으나 전환 순간의 실기 동작은 미검증. 마이크 거부 시 조도 단독 루프.
- 거치 자동 감지(충전 이벤트·devicemotion)는 후속 WO 로 분리 — 시작 버튼이 세션 시작. `feature/live.md` 는 실기 전이라 갱신하지 않았다.
- 표정 WO 4건([WO-01b-7]~[WO-01b-10]) Verifying — 키 6·7·8(표정)·q/w/e(모드)로 즉석 확인 뒤 PO 가 Closed/Active 판정. 표정 **디자인** 제안 6건(눈 형태 어휘·입 굵기·아침 색온도·zzz 위치·어휘 빈자리·지름 유지)은 [WO-01b-10] §디자인 제안 — 확산지([WO-01d-3]) 뒤 판단.
- [PLAN-01b] 영향권의 Verifying 잠금이 6건([WO-01b-5][WO-01b-6] + 신규 4)이다 — 회고(PO 판정 배치)에서 정리할 것.
- UX 브리핑(2026-11-05) 8항목 중 1·2·3·4·5·7 해소([ADR-123][ADR-124]), 6번은 아침 회고 문장 1줄로 최소 해소, 8번은 시작 화면 재구성으로 자연 해소. 케어 문장 17종 어감은 인간 검수 대기([WO-01c-1] Closed 조건).
- [CON-01]·[CON-02] 편집 시 Verifying 자손 [WO-01b-5][WO-01b-6] 잠금 노출 — 인간 승인 하에 진행([ADR-401]). 그 WO 의 소유 세션은 계약 v0.5/v0.2 를 재확인할 것.
- 하네스: `weakening-guard.js` 로컬 포크([ADR-306]) 상류 제안 대기 · 상류 전용 스크립트 18개 동결(인간 결정) · review `_GUIDE` 5건 `--ack-review` 대기 · [WO-02f-2](밤샘, 보드 경로)는 보류.
- 회고 트리거 due(정체 WO 24·GC 가능 PLAN 1) — 회고 제안 — 정체 WO 24 ≥ 5.

## 5. Verification status
- root: `npm test` 72/72(mode-core 8 · care-core 6 · emotion-core 6 · serve 15 포함) · `npm run lint` · `health` 전 게이트 · `weakening-guard` PASS · `permission-guard --strict`(HISTORY 편집은 Approved-by 트레일러).
- 헤드리스 게이트: `scripts/mode-gate.js` 42/42 · `scripts/face-gate.js` 15/15(Playwright 필요). 미검증: **폰 실기 자동 전환** · 상수 실값 · 마이크 전환 · 권한 대화상자 실흐름(Permissions API 상태 매핑) · 케어 띠와 입의 실기 간격 · Railway 배포본.
