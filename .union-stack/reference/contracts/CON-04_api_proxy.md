<!-- [Schema/계약·상태] 프록시 API 계약. 셸(제공) ↔ 놀이(소비)가 여기서 만난다. 제공자 중립이 요점. -->
---
id: CON-04
title: 프록시 API 계약 (/api/* — serve.js → 놀이)
status: Draft
tier: draft
version: 0.2
---

# [CON-04] 프록시 API

> **존재 이유 — 제공자 격리.** 클라이언트는 LLM/STT 제공자를 모른다(HISTORY 2026-08-22 — 제공자 교체 시 클라이언트 무변경). 키는 Railway 환경변수에만 존재한다.
> consumers: [WO-02b-1](소비 — `app/play.js`) · [WO-02a-3](제공 — `scripts/serve.js`).
>
> **v0.2 (2026-11-05, [WO-02b-1] 착수 · 인간 승인)** — 반응 어휘 확정(표정 = 얼굴 [CON-01b] kind 의 놀이 부분집합), 목록 밖 값의 서버측 접기, `caption` v1 미표시, STT 녹음 형식 목록, 페르소나에서 사용자=아동 표현 제거(아동 타깃은 스코프 밖 — [ARCH-01]). 근거 [ADR-308].

## 엔드포인트 (v0.2)
```
POST /api/stt    body: audio (아래 형식)             → 200 { text }
POST /api/chat   body: { messages, persona: "pal" } → 200 { emotion, expression, babbleTone,
                                                            sleepIntent: bool, caption? }
```
- **열거값(v0.2 확정)** — 제공(`serve.js` `VOCAB`)과 소비(`play-core.mjs`)가 같은 목록이며 `scripts/play-core.test.js` 가 대조한다.

  | 필드 | 값 | 목록 밖이면 | 소비 |
  |---|---|---|---|
  | `expression` | `happy` · `curious` · `sad` · `thinking` · `yawn` | `curious` | [CON-01b] `expr:trigger` kind 그대로(`source:"play"`). 센서 반응(`startled`·`relieved`)·fx(`note`)는 LLM 이 고르지 않는다 |
  | `babbleTone` | `soft` · `bright` · `drowsy` | `soft` | [CON-01b] `LEGACY_TONES` → tone 수치. 옹알이 합성은 [WO-02b-2] |
  | `emotion` | `calm` · `happy` · `sleepy` · `curious` · `sad` | `calm` | v1 은 기록만(표정은 `expression` 이 정한다) |
  | `sleepIntent` | `true` 만 참 | `false` | 클라이언트가 하품 → `mode.js` `command('sleep')`([CON-02] 규칙 1) |

- `caption`: 선택 한 줄(≤80자). **v1 클라이언트는 표시하지 않는다** — 팰은 사람 말을 하지 않는다([PLAN-02] §1). 쓰게 되면 R2(주어는 팰) 검수 후.
- `messages`: `user`·`assistant` 역할만(시스템 프롬프트는 서버 소유 — 클라이언트 주입 400). `assistant` 내용은 앞 반응의 JSON 문자열.
- **STT 형식** — Content-Type 의 기본형으로 판별해 파일 확장자를 붙인다(제공자가 확장자로 형식을 본다): `audio/webm`(Chrome·Android) · `audio/mp4`·`audio/m4a`·`audio/aac`(iOS Safari) · `audio/ogg` · `audio/mpeg` · `audio/wav`. 목록 밖은 `audio/webm` 으로 접는다(헤더 주입 차단). 언어 힌트 `PROXY_STT_LANG`(기본 `ko`, 빈 값이면 생략).

## 오류 계약
| 상황 | 응답 | 클라이언트 의무 |
|---|---|---|
| 키 미설정 | 503 `{error:"no-key"}` | 사전 반응 폴백(R8) — 사용자에게 에러를 보이지 않는다 |
| 상류 타임아웃 | 504 | 동일 폴백 |
| 과대 요청 | 413 | 녹음 길이 상한으로 예방(v1: 8초) |
| 상류 형태 오류 | 502 `{error:"upstream"}` | 동일 폴백 |
| 클라이언트 측 | 타임아웃(8초)·오프라인·STT 빈 문장 | 동일 폴백 — 원인은 디버그 로그에만 |

## 규칙
1. 제공자명·모델명이 응답에 새지 않는다(로그 포함).
2. `/api/*` 는 서비스워커 캐시 금지([WO-02a-1]).
3. 계약 변경은 제공·소비 양측 합의 + 버전 증가.
