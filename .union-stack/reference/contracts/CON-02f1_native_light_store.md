<!-- [Schema/계약·상태] RN 조도 수집기(쓰기) ↔ RN 아침 기록 화면(읽기)의 네이티브 조도 저장 계약 초안. -->
---
id: CON-02f1
title: RN 네이티브 조도 버킷 저장 계약
status: Draft
tier: draft
version: 0.1
consumers: [PLAN-02f, CON-02f, WO-02f-1]
---

# [CON-02f1] RN 네이티브 조도 버킷 저장 계약

## 존재 이유

[CON-03]은 최신 [PLAN-02] 시연 시나리오의 IndexedDB 수면 기록·대화 일기·알람 계약이다. RN 호스트가 NU40의 5Hz 조도를 SQLite에 집계하는 수직 슬라이스는 저장소와 소비자가 다르므로 이 하위 계약으로 분리한다. 둘을 같은 계약 버전으로 덮어쓰면 최신 main의 인간 합의와 이미 검증된 RN 구현 중 하나가 사라진다.

## 저장소

SQLite `sleepal.db`. RN repository가 유일한 쓰기 주체이고 RN 기록 화면은 repository query만 사용한다. 5Hz `LUX:` 원본은 메모리에서 분 단위로 집계한 뒤 버린다.

## 논리 형태

```ts
type SleepSession = {
  id: string;
  startedAt: number;
  endedAt: number | null;
  causeIn: string;
  causeOut: string | null;
  schemaVersion: 2;
};

type LightBucket = {
  sessionId: string;
  minuteAt: number;
  lux: { count: number; mean: number | null; min: number | null; max: number | null };
  gapMs: number;
};

type SensorEvent = {
  sessionId: string;
  t: number;
  kind: "sensor_gap" | "ble_disconnect" | "unknown";
  durationMs: number | null;
};
```

## 규칙

1. 스키마에 `sound`, `voice`, `speech`, `snore`, `movement`, `pose`, `sleepStage`를 만들지 않는다. 이 계약은 NU40 조도 연결 품질과 환경 사실만 다룬다.
2. 점수·등급·전일 비교 필드를 만들지 않는다. 조도 수치는 내부 타임라인과 개발 진단용이다([ARCH-01] R6).
3. 분 단위 집계가 영속 단위다. `sensor_gap`과 `gapMs`로 데이터가 없던 시간을 숨기지 않는다.
4. 기본키는 `sessions(id)`, `light_buckets(sessionId, minuteAt)`, `sensor_events(sessionId, t, kind)`다. 같은 세션 재개 시 멱등 upsert한다.
5. 버전 증가 시 SQLite migration과 보존 검사를 함께 추가한다.
6. [CON-03]로의 병합·동기화는 이 계약의 암묵적 동작이 아니다. 필요해질 때 양쪽 소비자 합의로 별도 흐름을 정의한다.
