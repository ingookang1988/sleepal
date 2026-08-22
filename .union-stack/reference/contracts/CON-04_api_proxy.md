<!-- [Schema/계약·상태] 프록시 API 계약. 셸(제공) ↔ 놀이(소비)가 여기서 만난다. 제공자 중립이 요점. -->
---
id: CON-04
title: 프록시 API 계약 (/api/* — serve.js → 놀이)
status: Draft
tier: draft
version: 0.1
---

# [CON-04] 프록시 API

> **존재 이유 — 제공자 격리.** 클라이언트는 LLM/STT 제공자를 모른다(HISTORY 2026-08-22 — 제공자 교체 시 클라이언트 무변경). 키는 Railway 환경변수에만 존재한다.
> consumers: [WO-02b-1](소비) · [WO-02a-3](제공).

## 엔드포인트 (v0.1)
```
POST /api/stt    body: audio (webm/opus)            → 200 { text }
POST /api/chat   body: { messages, persona: "pal" } → 200 { emotion, expression, babbleTone,
                                                            sleepIntent: bool, caption? }
```
- `emotion`·`expression`·`babbleTone`: 열거값 — 확정은 [WO-02b-2] 표정·옹알이 어휘와 함께(양 파트 합의).
- `caption`: 선택 한 줄 자막. R2 — 주어는 팰.

## 오류 계약
| 상황 | 응답 | 클라이언트 의무 |
|---|---|---|
| 키 미설정 | 503 `{error:"no-key"}` | 사전 반응 폴백(R8) — 사용자에게 에러를 보이지 않는다 |
| 상류 타임아웃 | 504 | 동일 폴백 |
| 과대 요청 | 413 | 녹음 길이 상한으로 예방 |

## 규칙
1. 제공자명·모델명이 응답에 새지 않는다(로그 포함).
2. `/api/*` 는 서비스워커 캐시 금지([WO-02a-1]).
3. 계약 변경은 제공·소비 양측 합의 + 버전 증가.
