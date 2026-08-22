---
id: WO-02b-1
title: 놀이 왕복 v1 — 녹음→STT→LLM→반응 JSON
status: Active
parent: PLAN-02
evidence: "app/play.js 구현 + 로컬 목 상류 실측: 정상 왕복 반응 JSON·'나 이제 잘게'→sleepIntent:true palBus 발행·NIGHT 차단(R4)·키 없음 503→사전 반응 3종 폴백(R8)·/api/stt 200 — 폰 실기 왕복(마이크 녹음)·지연 실측 잔여"
closed_by: []
---
# [WO-02b-1] 놀이 왕복 v1

**선행 [WO-02a-2](모듈 분할) · [WO-02a-3](프록시).** LLM 의 역할은 말이 아니라 **반응 결정**이다([PLAN-02] §1) — 응답은 `{emotion, expression, babbleTone, sleepIntent}` 구조로 받고, 표현은 [WO-02b-2]가 맡는다.

## 목표
사용자가 팰에게 말하면 1~2초 안에 팰이 반응 JSON 을 받는 왕복이 폰 실기에서 성립한다.

## 수용 기준
- [ ] 길게 터치(또는 발화 감지)로 녹음 → `/api/stt` → 텍스트 → `/api/chat` → 반응 JSON([CON-04] 형태)
- [ ] 시스템 프롬프트: 팰 페르소나(아기·애완동물처럼, [ARCH-01] R2 — 팰이 주어) + JSON 강제
- [ ] **`sleepIntent` 의도 분류 포함** — "나 이제 잘게"류가 여기서 감지되어 [CON-02] 모드 전환 요청으로 전달([PLAN-02] §3, 별도 감지기 없음)
- [ ] 네트워크·API 실패 시 폴백: 사전 정의 반응 3종에서 랜덤(R8 — 끊겨도 팰은 반응한다)
- [ ] NIGHT 모드에서 놀이 채널 완전 차단(R4)

## 증거
폰 실기 왕복 캡처 + 왕복 지연 실측값 · 비행기 모드에서 폴백 반응 확인 · "나 이제 잘게" → sleepIntent=true 로그.
