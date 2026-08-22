<!-- [Wiki] 세션 이어달리기. 세션을 마치는 에이전트가 덮어쓴다.
     ⚠ 이 문서는 **포인터만** 담는다. 어떤 사실도 여기에만 있어서는 안 된다 —
     latest-only 이고 손으로 덮어쓰므로 병렬 세션이 서로를 지운다(2026-08-22 실제 발생).
     세부는 소유 WO·평면 문서에 두고 여기서는 ID로 가리킨다. -->
# Handoff → next session

## 1. Summary
**얼굴 계보(01b) 세션 — FACE 디렉션 v1 반영까지 완료.** ① [WO-01b-7](구 01b-5 — 이산 표정·입·fx) ② [WO-01b-6](시선+마이크 정책) ③ 인간 디렉션 3 WO 반영: [WO-02b-3](디렉션 보드 = 목업 v1.2) · [WO-01b-5](기본 5상태 개선 — 아침 포즈/개안·최소 개구·좌우 시간차·소등 연기) 구현. 시트 게이트 22 → **45/45**. WO id 충돌(01b-5)은 재번호로 해소([ADR-122]). geusan `feat/connection-and-sensor` 통합 검토 완료(§4).

## 2. Changed locations (ID list)
- **[ADR-122]**: `WO-01b-5_emotion_mouth_fx` → **[WO-01b-7]** 재번호(인간 디렉션의 base_face_refine 이 01b-5 를 가져감) — 코드 주석·원장·계약·목업 참조 일괄 치환
- 신설(구현 완료·Verifying): [WO-01b-7]([ADR-118] [ADR-119]) · [WO-01b-6]([ADR-120] [ADR-121])
- 인간 디렉션 반영: [WO-02b-3] **Verifying**(목업 v1.2 = 디렉션 보드 · 확정값은 [ADR-123]) · [WO-01b-5] **Verifying**(런타임 구현 + 시트 +5) · [WO-02b-2] 병합(main 판 LISTEN/THINK 기준 + 01b-7 수신부 주석)
- 코드(app/): `face/{mouth,fx,ear}.js` 신설 · `expression.js`(EMO·GZ·MORNING 포즈) · `eyes.js`(lowLidPath·소등 연기·개안 시간차) · `main.js`(MIN_APERTURE 5mm·깜빡임 좌우 60ms·배선·키 6~0 `,` `.` `/` `m`) · `ble.js`(DEVICE_PREFIX **SLEEPPAL**) · `index.html`(BUILD **2026-08-22k**) · `sw.js`(+3) · `face-sheet.html`(게이트 45 · 준비 폴링)
- [CON-02] v0.2 · `ref/mockups/sleepal-mockups.html` **v1.2**(가로 158×73 팰 5화면 · 세로 트래커 · 제스처 6종 디렉션 보드 · 녹색 듣기 점 제거)
- [ADR-401](초안 — NFC 거치 자동 실행) · 마운틴 전달용 이슈 초안 → **`.union-stack/spike/issue_draft_connection_and_sensor.md`**(게시 대기 — gh CLI/Chrome 확장 부재로 인간이 붙여넣기, 게시 후 spike 폐기)
- 신설 [LSN-01b](SW 캐시 — BUILD 범프 직후 시트 첫 로드는 이전 모듈 서빙, 재로드 후 판독. 2회 관측)

## 3. Next task (single entry point)
**[WO-02b-3]·[WO-01b-5] 인간 확인** — 목업 v1.2 디렉션 보드 승인 + 로컬 `node scripts/serve.js` → `/app/` 실기: 키 5(아침 시퀀스) · 4→5(개안 좌우 시간차) · 3→4(소등 연기 6.5s) · 2+슬라이더(최소 개구) · 6~9·`,` `.` `/`(제스처·시선). 이후 [WO-02b-2](옹알이+LISTEN·THINK — 선행 충족됨) 또는 [WO-02a-3] 잔여 → 02b~02e 병렬.
⚠ 배포는 로컬 `npm run deploy -- -p <projectId>`([ADR-116]) — BUILD 2026-08-22k 확인.

## 4. Open / cautions
- **`feat/connection-and-sensor`(geusan) 검토 완료** — 브리지 `window.SP.handleLine` 즉시 호환 · FE 광고명 SLEEPPAL 정합(8450eb9). 잔여: ① 펌웨어 `STATE:`/`SLEEPING` 미구현 ② `LUX:` ADC 레인지 압축 — 움찔 2 stop 미달 가능(실측 1.53) → 마운틴과 매핑/문턱 합의 ③ **HANDOFF·CON-03 병합 충돌 예정**(PR 순서 협의) ④ RN 래퍼 등장으로 [ADR-401] 재검토 여지. 수정 요청 목록은 이슈 초안(게시 대기 — gh/Chrome 확장 부재)
- WO 신설 병렬 구간에서 id 충돌 주의 — 신설 전 `sprint/` fetch 확인([ADR-122] 교훈)
- [WO-01b-5] 실기 잔여: 침실 휘도(확산·후광 촬영) · 시간차 사시 검증 · 10m 판독 — 인간
- [WO-01b-6] 잔여: 마이크 실기(스테레오·`EAR_SIGN`·WIND_DOWN 자동 켬) · 트래커 마이크 인수 계약은 T 착수 시 [CON-02] 명문화([ADR-121])
- `expr:trigger` 어휘 v0.2 잠정 — [WO-02b-2] 착수 시 6제스처(LISTEN·THINK 포함) 확장 합의(규칙 3)
- ADR 대역: 얼굴 101– **다음 124** · 몸통 201– 다음 206 · 그 외 301– 다음 305 · 트래킹 401– 다음 402
- [CON-01] 보드 왕복 0회 · [WO-01b-3] 오디오 미구현 · [WO-01e-1] 3:00 연출 미해결 · 몸통 [WO-01d-1] 인간 보류 · P1 밤샘 발열 리스크([PHASE-02] Exit gate 5)
- git: 브랜치 `claude/sleeppal-fe-expression-rendering-7b2e04` — **전부 커밋·푸시 완료**(e796b02 → d7b2ae3 + 종료 커밋). main 병합 필요 — `feat/connection-and-sensor` 와 PR 순서 협의 후 나중 쪽이 HANDOFF·CON-03 수동 통합

## 5. Verification status
- `app/face-sheet.html` **45/45**(기존 40 회귀 무손상 + 아침 포즈/개안/최소 개구/깜빡임 시간차/소등 연기 5) · `zfs-linter` · `permission-guard` · `work-close --table --write` 통과 · 목업 렌더 검증(가로 5 · 세로 4 · 비율 2.16 · 오버플로 0)
- 실기 검증 전부 미완(폰 크롬 · 보드 · BLE 왕복 · 발열) — 이월
