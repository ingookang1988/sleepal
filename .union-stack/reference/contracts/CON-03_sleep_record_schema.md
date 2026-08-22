<!-- [Schema/계약·상태] 수면 기록 스키마. 엔진(쓰기) ↔ 기록 화면(읽기)이 여기서 만난다. -->
---
id: CON-03
title: 수면 기록 스키마 (IndexedDB — 트래커 엔진 → 기록 화면)
status: Draft
tier: draft
version: 0.1
---

# [CON-03] 수면 기록 스키마

> **존재 이유 — 파트 내부 경계이자 스택 경계.** 쓰는 쪽([WO-02d-2] 바닐라)과 읽는 쪽([WO-02e-1] React)이 스택이 다르다 — 공유하는 것은 이 스키마뿐이어야 React 지연 도입이 성립한다(HISTORY 2026-08-22).
> consumers: [WO-02d-2](쓰기) · [WO-02e-1](읽기 전용).

## 저장소
IndexedDB `sleepal` / store `sessions`(keyPath `id`) + `events`(keyPath `[sessionId, t]`). 원음 저장 금지 — 이벤트·집계만([PLAN-01c] "오디오는 기기를 떠나지 않는다").

## 형태 (v0.1 — 필드 확정은 02d 착수 전)
```js
// session
{ id, startedAt, endedAt, cause: {in, out},          // 전환 사유([CON-02] cause 재사용)
  env: { luxTimeline: [...], noiseTimeline: [...] },  // 집계 버킷(분 단위)
  counts: { snore, movement, unknown } }
// event
{ sessionId, t, kind: "snore"|"movement"|"unknown", strength }  // strength 내부용
```

## 규칙
1. **R6 지대** — 스키마에 점수·등급 필드를 만들지 않는다. `strength` 등 수치는 내부 판정용이고 화면 노출 금지는 [WO-02e-1] 수용 기준이 집행한다.
2. 마이그레이션: 버전 증가 시 upgrade 경로를 함께 정의(발표 전이라도 실기록을 버리지 않는다).
3. 읽기 쪽은 쓰지 않는다 — 위반은 결함.
