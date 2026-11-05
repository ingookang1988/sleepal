<!-- [Wiki] 세션 이어달리기. 세션을 마치는 에이전트가 덮어쓴다.
     ⚠ 이 문서는 **포인터만** 담는다. 어떤 사실도 여기에만 있어서는 안 된다 —
     latest-only 이고 손으로 덮어쓰므로 병렬 세션이 서로를 지운다(2026-08-22 실제 발생).
     세부는 소유 WO·평면 문서에 두고 여기서는 ID로 가리킨다. -->
# Handoff → next session

## 1. Summary
2026-11-05 세션 2: **[WO-02b-1] 놀이 왕복 v1 구현**(Active, 헤드리스 완료 · 실기 대기). 길게 누름/스페이스 → 녹음 → `/api/stt` → `/api/chat` → 얼굴 표정, sleepIntent → 하품 → SLEEP, R4 차단·R8 폴백 5경로. v1 놀이 = 양 세기, [CON-04] v0.2(표정 어휘 = [CON-01b] kind, 프롬프트에서 아동 표현 제거, caption 미표시) — 결정 근거 전부 [ADR-308]. 직전 세션(배포 BUILD `2026-11-05e`)의 요약은 [ADR-123]~[ADR-126]·[ADR-401].

## 2. Changed locations (ID list)
- [CON-04] v0.2 · 원장 [ADR-308] · [WO-02b-1] Draft→Active
- `app/`: `play.js`·`play-core.mjs`(신규), `main.js`(initPlay·SP)·`hud.js`(play 줄)·`face/ear.js`(`earStream`)·`sw.js`(셸)·`index.html`(BUILD `2026-11-05f`)
- `scripts/`: `serve.js`(VOCAB·PAL_SYSTEM·STT 형식/언어) · `serve.test.js` · `play-core.test.js`·`play-gate.js`(신규)

## 3. Next task (single entry point)
**[WO-02b-1] 실기 검증 — 인간 손이 필요**: ① Railway 에 `PROXY_API_KEY`(또는 `OPENAI_API_KEY`) 설정 → 배포(BUILD `2026-11-05f`) → `curl -X POST https://<도메인>/api/chat -H 'Content-Type: application/json' -d '{"messages":[{"role":"user","content":"양 한 마리"}]}'` 1왕복 ② 폰: 시작 2단계 → 화면을 한 손가락으로 0.5초 이상 누른 채 말하고 떼기 → 세 손가락 디버그의 `play` 줄에서 지연(stt·chat·총) 확인 ③ "나 이제 잘게" → 하품 → 잠듦 ④ 비행기 모드에서 누르기 → 사전 반응. 결과를 [WO-02b-1] 증거에 적고 Verifying 으로. 그다음 [WO-02b-2](옹알이 — `babbleTone` 소비).

## 4. Open / cautions
- **인간 결정 대기**: [PLAN-02] §놀이 후보 표의 "선정 미확정" → "v1 = 양 세기" 갱신 — Verifying 자손 때문에 blast-radius Fail-close 라 에이전트가 손대지 않았다([ADR-308] ①).
- iOS Safari 녹음은 mp4 — 프록시가 확장자를 맞추지만 **실기 미확인**. 길게 누름 0.5초·녹음 상한 8초·클라이언트 타임아웃 8초·하품 2.5초는 잠정(URL `?pressMs=&maxRecMs=&playTimeoutMs=&yawnLeadMs=`).
- face-gate 가 main 에서도 **1/22 FAIL**(MORNING 눈 높이 45.9 vs 문턱 >46, 호흡 위상 의존 — 이 작업 무관). 수정 작업 제안을 별도 카드로 냄([PLAN-01b] Verifying 잠금 영역).
- 이월: 실기 미검증(앱 단독 자동 전이 [WO-02d-1] · 케어 문장 [WO-01c-1] · 표정 WO 4건) · 모드 상수 실측 전([ADR-401] ⑤) · 회고 due · 하네스 잔여([ADR-305][ADR-306]).

## 5. Verification status
- root: `npm test` 82/82 · `npm run lint` · `health` · `permission-guard --strict`(이 PR 커밋 기준).
- 헤드리스: `play-gate.js` 31/31(2회 연속) · `mode-gate.js` 42/42 · `face-gate.js` 21/22(기존 FAIL 1, 위 §4).
- 미검증: 폰 실기 전부 · 실제 LLM 의 sleepIntent 분류 품질 · 실키 지연.
