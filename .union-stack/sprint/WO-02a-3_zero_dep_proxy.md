---
id: WO-02a-3
title: serve.js 프록시 — STT·LLM 키의 서버측 격리
status: Verifying
parent: PLAN-02
evidence: "구현 완료: serve.js 에 /api/chat·/api/stt([CON-04] 형태 고정 · 제공자 어댑터 서버 내부) · 회귀 14건(serve.test.js — 목 상류 왕복 chat/stt · no-key 503 · bad-json/역할주입 400 · 413 · 교차출처 403 · 405 · 상류 무응답 504 · 정적 200/404) · npm test 36/36 · 로컬 curl: no-key 503 {error:no-key} · GET /app/ 200 유지. 미완(실기): Railway 키 설정 후 폰에서 1왕복"
closed_by: []
---
# [WO-02a-3] zero-dep 프록시

API 키는 클라이언트 PWA 에 둘 수 없다(노출 = 도용). 이미 Railway 에서 도는 `scripts/serve.js` 에 엔드포인트를 붙인다 — 의존성 0 유지(Node 18+ `fetch` 내장). [CON-04]가 이 WO 의 계약이다.

## 목표
클라이언트는 제공자(OpenAI 등)를 모른 채 `/api/*` 만 호출하고, 키는 Railway 환경변수에만 존재한다.

## 수용 기준
- [x] `POST /api/chat` — [CON-04] 요청/응답 형태 구현. 제공자 어댑터는 서버 내부(교체 시 클라이언트 무변경 — `PROXY_CHAT_URL`·`PROXY_CHAT_MODEL` 환경변수로 교체)
- [x] `POST /api/stt` — 음성 파일 → 텍스트(같은 원칙, zero-dep 수제 multipart)
- [x] 키는 `process.env` 에서만 읽고 **로그에 남기지 않는다**(로그는 메서드·경로·상태·ms 만) · 키 부재 시 503 `{error:"no-key"}`
- [x] 요청 크기 상한(chat 64KB · stt 8MB → 413) · 타임아웃(기본 20s → 504) · 동일 출처 외 거부(403)
- [x] 정적 서빙 경로 회귀 없음(회귀 테스트 + curl 200 확인)

## 증거
로컬 curl 왕복 로그(chat·stt) · 키 미설정 시 503 확인 · Railway 배포 후 폰에서 1왕복.
