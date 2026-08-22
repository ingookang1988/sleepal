<!-- [Schema/계약·상태] RN BLE 호스트 ↔ PWA WebView 메시지 계약 초안. -->
---
id: CON-02f
title: RN 네이티브 ↔ PWA WebView 브리지 계약
status: Draft
tier: draft
version: 0.3
consumers: [PLAN-01b, PLAN-02f]
---

# [CON-02f] RN 네이티브 ↔ PWA WebView 브리지

## 존재 이유

[PLAN-02f]에서 RN은 BLE transport를, PWA는 눈·표정 런타임을 소유한다. 양쪽이 따로 메시지를 만들지 않고 이 문자열 JSON envelope만 공유한다. 보드 메시지의 의미는 새로 정의하지 않고 [CON-01] 원본 라인을 그대로 운반한다.

## 전송 방식

- RN → Web: `WebView` ref의 `postMessage(JSON.stringify(envelope))`.
- Web → RN: `window.ReactNativeWebView.postMessage(JSON.stringify(envelope))`; RN은 `onMessage`로 받는다.
- 양방향 payload는 문자열 JSON 하나다. 객체 직접 전달, 임의 JS 실행, 함수 이름 호출을 계약으로 삼지 않는다.
- PWA가 `web/ready`를 보내기 전 RN은 센서 라인을 보내지 않는다. 준비 후 현재 연결 상태와 마지막 `LUX:BASE`, `STATE`, `LUX`를 순서대로 재전달한다.

## 공통 envelope

```ts
type BridgeEnvelope<T extends string, P> = {
  v: 1;
  type: T;
  seq: number; // 송신자별 단조 증가. 재시작 시 0부터 가능
  at: number;  // 송신 시각 Unix epoch milliseconds
  payload: P;
};
```

수신자는 `v !== 1`, 알 수 없는 `type`, JSON 파싱 실패, 필드 범위 오류를 무시하고 런타임을 죽이지 않는다. `seq`는 진단과 중복 억제용이며 exactly-once를 보장하지 않는다.

## Web → RN

| type | payload | 의미 |
|---|---|---|
| `web/ready` | `{bridgeVersion: 1}` | PWA listener 준비 완료. RN이 현재 상태를 재전달한다 |
| `ble/connect` | `{}` | 사용자 동작으로 scan/연결 요청. 이미 연결 중이면 멱등 처리 |
| `ble/write` | `{line: string}` | [CON-01] 폰→보드 한 줄. 개행은 RN이 붙인다 |

`ble/write.line`은 ASCII, 빈 문자열 금지, 최대 63바이트다. RN은 [CON-01]에 없는 명령을 릴리스 빌드에서 거부한다. 현재 허용값은 `LED:<0-255>`, `TILT:<-90..90>`, `SHAKE`, `WAKE`이며 디버그 전용 명령은 개발 진단 화면에서만 노출한다.

## RN → Web

| type | payload | 의미 |
|---|---|---|
| `native/ready` | `{bridgeVersion: 1, platform: "android"\|"ios"}` | RN 브리지 사용 가능. 이 메시지를 받으면 Web Bluetooth를 시작하지 않는다 |
| `ble/status` | `{state: "idle"\|"scanning"\|"connecting"\|"connected"\|"ended"\|"error", deviceName?: string, reason?: string}` | 연결 상태. 프로덕션 얼굴 위 텍스트 표시 금지 |
| `ble/line` | `{line: string}` | 개행을 제거한 얼굴 소비 라인: `HELLO`, `LUX:*`, `STATE:*`, `SLEEPING` |

`ble/line`은 RN line buffer가 완성한 ASCII 한 줄만 전달한다. notify chunk를 그대로 전달하지 않는다. RN은 수신 순서를 보존하고, PWA는 `payload.line`을 기존 `handleLine()`에 넘긴다. `IMU:`·`MOVE:`와 알 수 없는 라인은 얼굴에 전달하지 않는다. `SLEEPING` 뒤 `ble/status.state="ended"`는 정상 종료이며 자동 재연결하지 않는다([CON-01] 규칙 4).

## 생명주기 규칙

1. **BLE 소유자는 RN 하나다.** `native/ready`가 있는 WebView에서 `navigator.bluetooth` 호출은 계약 위반이다.
2. WebView reload마다 `web/ready` handshake를 다시 한다. RN은 BLE를 끊지 않고 마지막 상태만 재전달한다.
3. 앱 재시작은 새 bridge session이다. `seq` 연속성을 기대하지 않는다.
4. PWA가 없는 동안에도 RN의 조도 분 버킷 기록은 계속될 수 있다. 브리지는 UI 전달 경로이지 저장 경로가 아니다.
5. RN은 `ble/line`이나 5Hz 조도 원본을 DB에 무제한 저장하지 않는다. 네이티브 조도 집계는 [CON-02f1]을 따른다.

## 보안 규칙

- WebView navigation은 번들 자산과 승인된 PWA origin만 허용한다. 외부 링크는 WebView 안에서 열지 않는다.
- `onMessage`는 현재 main frame의 승인된 source에서 온 envelope만 처리한다.
- bridge에 토큰·API 키·개인 식별자를 넣지 않는다.
- WebView 메시지는 신뢰 입력으로 간주하지 않는다. `ble/write`는 allowlist와 길이 검증 뒤 전송한다.

## 최소 검증 예

```json
{"v":1,"type":"web/ready","seq":0,"at":1787360400000,"payload":{"bridgeVersion":1}}
{"v":1,"type":"ble/line","seq":41,"at":1787360400200,"payload":{"line":"LUX:37"}}
{"v":1,"type":"ble/line","seq":42,"at":1787360400400,"payload":{"line":"STATE:DROWSY"}}
```

검사는 ① ready 전 라인 미전달 ② ready 후 최신 상태 재전달 ③ 여러 notify chunk의 라인 복원 ④ 잘못된 JSON 무시 ⑤ `SLEEPING` 정상 종료 ⑥ allowlist 밖 `ble/write` 거부를 포함한다.
