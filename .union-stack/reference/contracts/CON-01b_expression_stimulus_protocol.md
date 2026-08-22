<!-- [Schema/계약·상태] 원시 센서·앱 사건 → 팰 표정 합성 계약 초안. [CON-02]의 expr:trigger 전송 형식을 구체화한다. -->
---
id: CON-01b
title: 팰 표정 자극 프로토콜 (센서·놀이·버튼 → 얼굴 합성)
status: Draft
tier: draft
version: 0.1
consumers: [CON-02f, WO-02b-2, WO-02c-1]
---

# [CON-01b] 팰 표정 자극 프로토콜

## 경계

- [CON-01]은 보드의 원시 사실(`STATE`, `LUX`, `BTN`)만 전달한다. 보드가 감정 이름을 보내면 결함이다.
- [CON-02f]는 RN↔WebView 운반을 담당한다. `ble/line`은 원문을, `expr/trigger`는 RN이 이미 의미를 확정한 앱 사건만 운반한다.
- PWA 안에서는 [CON-02]의 기존 `palBus` 이벤트 `expr:trigger`를 재사용한다. 이 문서는 그 이벤트의 어휘·원인·합성 규칙을 구체화하며 [CON-02]의 모드 계약을 바꾸지 않는다.

## 표준 payload

```ts
type ExpressionTrigger = {
  kind: "happy" | "curious" | "sad" | "startled" | "relieved" | "note";
  tone: number; // 0..1
  source: "play" | "lux" | "sound" | "button" | "system";
};
```

- `tone`의 표준 wire 값은 숫자다. PWA 수신부는 기존 babbleTone 문자열 `soft|bright|drowsy`를 호환 입력으로만 받아 각각 `0.6|1|0.35`로 정규화한다.
- 알 수 없는 kind/source, 범위 밖 tone, 추가 필드가 있는 payload는 무시한다. 수신 실패가 얼굴 루프를 죽이면 결함이다.
- 같은 표정 채널에 새 사건이 오면 마지막 사건이 이전 봉투를 대체한다. `STATE`는 바꾸지 않는다.

## 자극 매핑

| 입력 | 연속 채널 | 이산 표정 | source |
|---|---|---|---|
| `LUX` 급상승 | glare 증가 + 움찔 | `startled` | `lux` |
| `LUX` 급하강 | glare 놓아줌 + 안도 | `relieved` | `lux` |
| 높은 조도 유지 | glare 찡그림 | 없음 — 연발 금지 | `lux` |
| 소리 트랜지언트 | 소리 방향 시선 | `curious` | `sound` |
| 보드 `BTN:A:DOWN`/거치 확정 | 얼굴 진입 | `happy` | `button` |
| 놀이 응답 | 없음 | `happy|curious|sad` | `play` |
| 사운드 도상 1발 | 없음 | `note` | `system` |

센서 매핑은 **원시값과 별개인 파생 반응**이다. `LUX`가 이산 표정을 만들더라도 [CON-01] 규칙 2대로 상태 전이는 0이다.

## 상태·우선순위

1. `STATE`가 기본 눈·색·호흡을 정한다.
2. 연속 환경 채널(glare·gaze)이 그 위에 합성된다.
3. 이산 표정 봉투가 마지막에 합성되며 끝나면 채널 0으로 돌아간다.
4. `AWAKE/MORNING`은 tone 100%, `DROWSY`는 50%, `ASLEEP/NIGHT`는 이산 표정 0이다. ASLEEP의 `zzz`만 상태 자체의 도상으로 허용하고 NIGHT 진입 즉시 모두 제거한다([ARCH-01] R4).
5. 표정은 얼굴을 설명할 뿐 사용자를 평가하지 않으며, 문자·점수·알림을 만들지 않는다(R2·R3·R6).

## 최소 검증

- 잘못된 payload 무시
- lux rise→`startled`, fall→`relieved`, sound→`curious`, button→`happy`
- 모든 트리거 전후 `F.state` 동일
- 봉투 종료 후 기하 원복
- ASLEEP/NIGHT 이산 표정 0, NIGHT 입·시선·fx 0
