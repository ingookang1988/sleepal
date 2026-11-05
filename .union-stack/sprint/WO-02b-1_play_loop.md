---
id: WO-02b-1
title: 놀이 왕복 v1 — 녹음→STT→LLM→반응 JSON
status: Active
parent: PLAN-02
evidence: "scripts/play-gate.js 31/31 · scripts/play-core.test.js 10/10 · scripts/serve.test.js 25/25 (헤드리스·목 상류). 남음: 폰 실기 1왕복 캡처 + 지연 실측(실키)"
closed_by: []
---
# [WO-02b-1] 놀이 왕복 v1

**선행 [WO-02a-2](모듈 분할) · [WO-02a-3](프록시).** LLM 의 역할은 말이 아니라 **반응 결정**이다([PLAN-02] §1) — 응답은 `{emotion, expression, babbleTone, sleepIntent}` 구조로 받고, 표현은 [WO-02b-2]가 맡는다.

## 목표
사용자가 팰에게 말하면 1~2초 안에 팰이 반응 JSON 을 받는 왕복이 폰 실기에서 성립한다.

## 결정 (착수 2026-11-05, 인간 승인 — [ADR-308])
- v1 놀이 = **양 세기** 하나(루프는 놀이 무관, 양 세기는 시스템 프롬프트 층). 메아리 놀이는 [WO-02b-2] 쪽 R8 폴백 승격으로.
- 입력 = 한 손가락 **길게 누름**(0.5초) 동안 녹음 · 데스크톱 스페이스. 발화 자동 감지는 v1 밖.
- 마이크 = 귀가 켜져 있으면(WIND_DOWN) **스트림을 빌린다**, 아니면 녹음 동안만 열고 반납.
- `caption` 미표시 · sleepIntent → 하품 → 2.5초 뒤 `command('sleep')`.
- [CON-04] v0.2 — 표정 어휘를 [CON-01b] kind 로, 페르소나에서 사용자=아동 표현 제거.

## 수용 기준
- [x] 길게 터치(또는 발화 감지)로 녹음 → `/api/stt` → 텍스트 → `/api/chat` → 반응 JSON([CON-04] 형태) — `app/play.js` · `app/play-core.mjs`
- [x] 시스템 프롬프트: 팰 페르소나(아기·애완동물처럼, [ARCH-01] R2 — 팰이 주어) + JSON 강제 — `scripts/serve.js` `PAL_SYSTEM`
- [x] **`sleepIntent` 의도 분류 포함** — "나 이제 잘게"류가 여기서 감지되어 [CON-02] 모드 전환 요청으로 전달([PLAN-02] §3, 별도 감지기 없음) — 헤드리스는 목 상류로 확인, **실제 LLM 분류는 실기에서**
- [x] 네트워크·API 실패 시 폴백: 사전 정의 반응 3종에서 랜덤(R8 — 끊겨도 팰은 반응한다) — 키 없음·504·클라이언트 타임아웃·오프라인·STT 빈 문장 5경로
- [x] NIGHT 모드에서 놀이 채널 완전 차단(R4) — SLEEP·ASLEEP·NIGHT 에서 누름 무시 · 녹음 중/응답 대기 중 SLEEP 이면 버림
- [ ] **폰 실기** 1왕복 · 지연 실측 · 비행기 모드 폴백 · "나 이제 잘게" → sleepIntent=true 로그 (Railway `PROXY_API_KEY` 필요)

## 증거
- 헤드리스(2026-11-05): `node scripts/play-gate.js` 31/31 — 가짜 마이크로 실제 MediaRecorder → serve.js → 목 상류. `npm test` 82/82(play-core 10 · serve 25 포함).
- 남음: 폰 실기 왕복 캡처 + 왕복 지연 실측값(디버그 화면 `play` 줄) · 비행기 모드에서 폴백 반응 확인 · "나 이제 잘게" → sleepIntent=true 로그.
