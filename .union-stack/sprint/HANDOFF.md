<!-- [Wiki] 세션 이어달리기. 세션을 마치는 에이전트가 덮어쓴다.
     ⚠ 이 문서는 **포인터만** 담는다. 어떤 사실도 여기에만 있어서는 안 된다 —
     latest-only 이고 손으로 덮어쓰므로 병렬 세션이 서로를 지운다(2026-08-22 실제 발생).
     세부는 소유 WO·평면 문서에 두고 여기서는 ID로 가리킨다. -->
# Handoff → next session

## 1. Summary
**얼굴 계보(01b) 세션 — [WO-01b-5] 신설·구현·기계검증 완료(Verifying).** 인간 결정으로 이산 표정 트리거 수신부([CON-02] 소비부) + 아래꺼풀(웃는 눈 ⌣) + 입 + 떠다니는 도상(잠듦 zzz · 음표)을 팰 런타임에 합성했다. 시트 게이트 22 → **31/31**. 결정은 [ADR-118](도입) · [ADR-119](zzz/음표의 R3 해석 — 도형·눈 밖·게이트 고정). 직전 P1 기획 세션 내용은 [PHASE-02] · [PLAN-02] · HISTORY 2026-08-22 행 참조.

## 2. Changed locations (ID list)
- 신설: [WO-01b-5](Verifying — 세부 전부 여기) · [ADR-118] [ADR-119]
- 신설: [WO-01b-6](Verifying — 시선: 소리 나는 쪽 응시. `face/ear.js` 신규 · GZ 사카드 채널 · 키 `,` `.` `/` `m` · BUILD **2026-08-22i** · 시트 **40/40**) · [ADR-120](방향 소스 = 폰 스테레오 불균형 + 모노 정면 강등, 보드 방향은 로드맵) · [ADR-121](🎙 마이크 생애 = WIND_DOWN 세션 한정 — SLEEP·잠듦·밤 하드 밴, [CON-02] mode:change 소비자에 ear.js 추가)
- 코드(app/): `face/mouth.js`·`face/fx.js` 신설 · `face/expression.js`(EMO 봉투·palBus 구독) · `face/eyes.js`(lowLidPath) · `main.js`(배선·키 6~0·SP 훅) · `index.html`(마스크 lidL2/R2·입·fx defs·디버그 버튼 5·BUILD **2026-08-22g**) · `sw.js`(프리캐시 +2) · `hud.js`(emo/low 노출) · `face-sheet.html`(게이트 +9 · 고정 900ms → 준비 폴링)
- [CON-02] v0.1 → **v0.2**(`expr:trigger` kind 어휘 표 — 잠정, 발행자 착수 시 확정) · [WO-02b-2] 표정 동기 행 갱신("눈과 입이 함께 말한다")
- `ref/mockups/sleepal-mockups.html` v1.1 — main 의 v1(9화면)을 이 브랜치로 가져와 **표정 레퍼토리 섹션**(기쁨·호기심·서운함·하품·zzz·음표 6타일) 신설 + PLAY/WIND_DOWN/WAKE 얼굴에 입 반영 + SLEEP 에 zzz-R4 경계 주석
- 직전 세션분은 이전 HANDOFF 참조: [PHASE-02]·[PLAN-02]·[CON-02]~[CON-04]·[WO-02a-*]·[ADR-302]·[ADR-303]·[ADR-304]

## 3. Next task (single entry point)
**변동 없음 — [WO-02a-3](zero-dep 프록시) 잔여 확인 후 02b~02e 병렬 착수**(이전 HANDOFF 그대로: [WO-02a-2] Verifying — 폰 스모크만 남음). 얼굴 계보 쪽 다음 행동은 **[WO-01b-5] 인간 미적 판단**: 로컬 `node scripts/serve.js` → `/app/` 에서 키 **6 기쁨 · 7 호기심 · 8 서운함 · 9 음표 · 0 음악 · 3 잠듦(zzz)**, 또는 디버그 화면 버튼. 판단 항목은 [WO-01b-5] §남은 것.
⚠ 배포는 로컬에서 `npm run deploy -- -p <projectId>`([ADR-116]) — 배포 시 BUILD 2026-08-22g 확인.

## 4. Open / cautions
- [WO-01b-5] 폰 실기 미확인(이 머신 브라우저 비표시 — 전부 `SP._step` 결정적 경로) · 미적 판단 인간 몫 · [PLAN-01b] v0.3(입 기하 반영) 승격은 인간 몫
- `expr:trigger` 어휘는 **잠정 합의**([CON-02] v0.2) — babble.js([WO-02b-2])·sound.js([WO-02c-1]) 착수 시 규칙 3(전원 합의)로 확정할 것
- P1 최대 리스크 밤샘 상시 가동(발열·배터리) → [PLAN-02] §리스크 · [PHASE-02] Exit gate 5 (불변)
- ADR 대역: 얼굴 101– **다음 122** · 몸통 201– 다음 206 · 그 외/02a·02b 301– 다음 305 · 트래킹 401– **다음 402** — [ARCH-00] §ADR bands
- [WO-01b-6] 잔여: 마이크 실기(스테레오 여부·`EAR_SIGN`·문턱·WIND_DOWN 자동 켬 권한 경로) · WIND_DOWN 종료 시 스트림 반납 → 트래커 마이크 인수 계약은 T 착수 시 [CON-02] 명문화([ADR-121])
- [ADR-401](**초안**) — 거치 시 자동 실행: GPS 아님, NFC 태그 + OS 루틴 폴백 + 앱 내 자동 전이(충전+보드 BLE→WIND_DOWN). [WO-02d-1] 착수 시 확정·수용 기준 편입
- [CON-01] 여전히 미검증(보드 왕복 0회) · [WO-01b-3] 오디오 실기 잔여 · [WO-01e-1] 3:00 연출 인간 결정 미해결 · 카메라 "적응 중" 배너 기획 미착수([ADR-117])
- 몸통 계보 [WO-01d-1] 인간 보류 지시 유지 — 재개는 인간 신호로
- git: 이 세션은 worktree 브랜치 `claude/sleeppal-fe-expression-rendering-7b2e04` — main 병합 필요. 커밋은 인간 확인 후

## 5. Verification status
- 이 세션: `app/face-sheet.html` **31/31**(localhost 실행·기존 22 회귀 무손상 — 플레이키 900ms 타임아웃을 준비 폴링으로 교체) · `zfs-linter` 통과 · `permission-guard` 통과 · `work-close --table --write` 재생성. 런타임 수치 확인: 호기심 좌/우 48.4/42.0 · DROWSY 하품 발화 · NIGHT 입/fx/트리거 전부 0
- 실기 검증 전부 미완(폰 크롬 · 보드 · BLE 왕복 · 발열) — 이월
