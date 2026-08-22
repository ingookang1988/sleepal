---
id: WO-02a-3
title: serve.js 프록시 — STT·LLM 키의 서버측 격리
status: Draft
parent: PLAN-02
evidence: "none — 미착수 (완료 시: 키 없는 클라이언트에서 /api/chat 왕복 성공 로그)"
closed_by: []
---
# [WO-02a-3] zero-dep 프록시

API 키는 클라이언트 PWA 에 둘 수 없다(노출 = 도용). 이미 Railway 에서 도는 `scripts/serve.js` 에 엔드포인트를 붙인다 — 의존성 0 유지(Node 18+ `fetch` 내장). [CON-04]가 이 WO 의 계약이다.

## 목표
클라이언트는 제공자(OpenAI 등)를 모른 채 `/api/*` 만 호출하고, 키는 Railway 환경변수에만 존재한다.

## 수용 기준
- [ ] `POST /api/chat` — [CON-04] 요청/응답 형태 구현. 제공자 어댑터는 서버 내부(교체 시 클라이언트 무변경)
- [ ] `POST /api/stt` — 음성 파일 → 텍스트(같은 원칙)
- [ ] 키는 `process.env` 에서만 읽고 **로그에 남기지 않는다** · 키 부재 시 503 + 명시적 에러 바디(클라이언트 폴백 판단용)
- [ ] 요청 크기 상한 · 타임아웃 · 동일 출처 외 거부(CORS 잠금)
- [ ] 정적 서빙 경로 회귀 없음(기존 배포 200 유지)

## 증거
로컬 curl 왕복 로그(chat·stt) · 키 미설정 시 503 확인 · Railway 배포 후 폰에서 1왕복.
