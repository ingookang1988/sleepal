<!-- [Wiki] 세션 이어달리기. 세션을 마치는 에이전트가 덮어쓴다.
     ⚠ 이 문서는 **포인터만** 담는다. 어떤 사실도 여기에만 있어서는 안 된다 —
     latest-only 이고 손으로 덮어쓰므로 병렬 세션이 서로를 지운다(2026-08-22 실제 발생).
     세부는 소유 WO·평면 문서에 두고 여기서는 ID로 가리킨다. -->
# Handoff → next session

## 1. Summary
2026-11-05 세션(PR #9~#12, 전부 main 머지 · **Railway 배포 완료** BUILD `2026-11-05e`, 인간 보고): ① 하네스 상류 동기화([ADR-305][ADR-306][ADR-307]) ② 보드 선택화 — 폰 앱 단독 수면 루프 [WO-02d-1]([ADR-401], HISTORY 2026-11-05) ③ 케어 문장 띠 + 시작 화면 2단계 [WO-01c-1]([ADR-123]) ④ 세로 갸웃·밤 제스처 안전장치([ADR-124]) ⑤ 표정 동작 개선 1~7 [WO-01b-7]~[WO-01b-10]([ADR-125], 계측 [ANL-01b]) ⑥ 표정 디자인 제안 6건 구현([ADR-126], [CON-01b] v0.2 `thinking`·`yawn`).

## 2. Changed locations (ID list)
- HISTORY 2026-11-05 · [CON-01] v0.5 · [CON-02] v0.2 · [CON-01b] v0.2 · [ANL-01b] 신설 · 원장 [ADR-123]~[ADR-126] [ADR-305]~[ADR-307] [ADR-401]
- WO: [WO-02d-1] Active · [WO-01c-1] Active · [WO-01b-7]~[WO-01b-10] Verifying · [WO-02f-2] Draft
- `app/`: `mode-core.mjs`·`mode.js`·`care-core.mjs`·`care.js`·`face/mode-eyes.js`·`face/emotion-core.mjs`(신규), `main.js`·`hud.js`·`index.html`·`sw.js`·`face/*` · `scripts/`: 하네스 sync 67 + `serve.js`(.mjs MIME) + `mode-gate.js`·`face-gate.js`·`expr-probe.js` · `.union-stack/adapter.json`

## 3. Next task (single entry point)
**[WO-02b-1] 놀이 왕복 v1 — 팰이 사용자의 목소리를 인식하고 반응한다**(인간 지시 2026-11-05). 착수 순서: ① `scripts/serve.js` `/api/stt`·`/api/chat`([CON-04], [WO-02a-3] 구현 완료)에 Railway 환경변수(`PROXY_API_KEY` 또는 `OPENAI_API_KEY` · `PROXY_CHAT_URL`·`PROXY_CHAT_MODEL` · `PROXY_STT_URL`·`PROXY_STT_MODEL` · `PROXY_TIMEOUT_MS`)를 넣고 curl 1왕복 확인 ② `app/play.js`(T) — 길게 터치/발화 감지 → 녹음(webm) → STT → chat → 반응 JSON ③ 반응은 [CON-01b] `expr:trigger`(happy·curious·sad·thinking·yawn)로 얼굴에, `sleepIntent` 는 [CON-02] `mode.js` `command('sleep')` 으로 ④ 실패 폴백 3종(R8) · NIGHT 차단(R4) · 팰 주어(R2, `care-core.mjs` `lintLine` 재사용). 마이크는 귀([ADR-121], WIND_DOWN)·T 수음(SLEEP)과 **동시에 열지 않는다** — 녹음은 PLAY/WIND_DOWN 에서 귀 스트림을 빌리거나 귀를 잠시 끄고 연다. 착수 시 status Active, scaffold 는 쓰지 말 것(문서 이미 있음).

## 4. Open / cautions
- **실기 미검증**: 앱 단독 루프 자동 전이([WO-02d-1] Closed 조건), 케어 문장 어감 17종([WO-01c-1]), 표정 WO 4건 미적 판정 — 폰에서 시작 2단계 → 불 끄고 5분이면 한 번에 본다. 키: 1~5 상태 · 6~9 표정 · t 생각 · y 하품 · q/w/e/r 모드.
- 모드 상수(dark 40·bright 200·quiet 0.05·noise 0.12)는 실측 전([ADR-401] ⑤) — URL `?dark=&bright=&quiet=&noise=` 로 튜닝. 카메라 AE 때문에 어두운 방에서 `lux.last` 가 문턱 아래로 가는지가 첫 확인점.
- [PLAN-01b] Verifying 잠금 6건([WO-01b-5]~[WO-01b-10]) — 회고 PO 판정 배치에서 정리. 회고 트리거 due(정체 WO ≥ 5).
- 하네스: `weakening-guard.js` 로컬 포크([ADR-306]) 상류 제안 대기 · 상류 전용 스크립트 18개 동결(인간 결정) · review `_GUIDE` 5건 `--ack-review` 대기. 거치 자동 감지는 후속 WO. [WO-02f-2](보드 밤샘)는 보류.
- RN 앱([PLAN-02f]) 브리지 allowlist 는 [CON-01b] v0.1 부분집합 — `thinking`·`yawn` 은 RN 경로에서 무시된다(의도).

## 5. Verification status
- root: `npm test` 72/72 · `npm run lint` · `health` 전 게이트 · `permission-guard --strict` · CI 그린(main `130b44c`).
- 헤드리스(Playwright): `mode-gate.js` 42/42 · `face-gate.js` 22/22 · `face-sheet.html` OK 45/NG 0.
- 배포: BUILD `2026-11-05e` Railway 서빙 중(인간 `deploy.js --check-only` 보고). 미검증: 폰 실기 전부(§4 첫 항목).
