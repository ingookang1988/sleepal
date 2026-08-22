<!-- [Schema/계약·행위] RN 네이티브 호스트 + PWA WebView + BLE 수면 기록 개발 초안. -->
---
id: PLAN-02f
title: RN 앱 — NU40 조도 BLE와 PWA WebView 호스트
status: Draft
tier: draft
parent: PLAN-02
version: 0.5
---

# [PLAN-02f] RN 앱 — NU40 조도 BLE와 PWA WebView 호스트

## 결정 배경

2026-08-22 인간 요청으로 앱 경계를 다음처럼 다시 잡는다.

- 기존 PWA 얼굴은 폐기하거나 React로 다시 쓰지 않는다. RN 앱의 WebView 안에서 실행한다.
- 보드는 **NU40(nRF52840)**으로 유지한다. NU87/Wi-Fi CSI는 공개 SDK에 원시 I/Q 수집 경로가 없어 범위에서 제외한다.
- NU40 BLE 연결은 RN 네이티브 층이 단독 소유한다.
- 조도 데이터는 WebView에 전달해 졸린 눈과 연속 표정에 사용한다.
- RN은 조도 데이터를 SQLite에 집계하고 아침에 조도 환경 기록을 보여준다.
- PWA와 RN은 서로 다른 개발자가 작업하므로 소스 폴더와 런타임 계약을 분리한다.
- 초기 제품은 **전용 Android 폰 우선**이다. 앱을 켜면 전경에서 NU40을 자동 연결하고 바로 PWA 얼굴을 표시한다. 검은 대기는 정상 수면 종료 뒤에만 사용한다.
- BLE RSSI는 개발 진단용 `VERY_NEAR 추정` 보조값이다. 얼굴 진입 게이트로 쓰거나 정확한 10cm를 보장하지 않는다.
- BLE로 전달되는 센서 정보는 조도뿐이다. 소리 센서·원음·목소리·STT는 앱 범위에서 제외한다.
- 앱 mount 시 BLE 구독을 먼저 등록한 뒤 `SLEEPPAL-*` scan/connect를 자동 시작한다. 연결 성공 시 대기 화면을 거치지 않고 PWA 얼굴을 연다. 연결 화면은 오류·권한 거부·Bluetooth OFF의 재시도 폴백이다.

이는 [ADR-302]가 차단한 "팰 런타임의 전면 React 재작성"이 아니다. `app/`의 바닐라 PWA 런타임은 유지하고 네이티브 기능만 RN 호스트로 옮긴다. 최신 [PLAN-02]의 제품 수면 기록·대화 일기·알람은 [CON-03]을 유지하고, RN 수직 슬라이스의 조도 SQLite는 [CON-02f1]로 분리한다.

## 목표와 비목표

### 목표

1. RN 앱이 [CON-01] NUS 장치에 연결하고 알림 라인을 끊김 없이 수신한다.
2. RN이 수신한 조도·상태 라인을 [CON-02f]로 WebView에 전달한다.
3. WebView는 기존 `handleLine()`/`feedLux()` 경로를 재사용해 눈 상태와 표정을 바꾼다.
4. RN이 조도를 분 단위로 SQLite에 집계하고 아침 조도 환경 기록을 만든다.
5. 앱 mount에서 BLE를 자동 연결하고 `connected` snapshot 즉시 얼굴로 전환한다.
6. 인터넷이 없어도 NU40 BLE → 얼굴 반응 → 조도 기록이 동작한다([ARCH-01] R8).

### 이번 초안의 비목표

- PWA 얼굴 구현 변경: `app/` 담당자가 [CON-02f] 어댑터를 별도 구현한다.
- 소리 센서·원음 녹음·목소리·STT·코골이·뒤척임 식별.
- BLE RSSI만으로 정확한 `10cm` 또는 미터 거리를 보장하는 것.
- Wi-Fi CSI 기반 사람 존재·자세·수면 단계 추적.
- 화면이 꺼졌거나 다른 앱이 전면인 일반 사용자 폰에서 앱을 강제로 전면 실행하는 것.
- 수면 점수·등급·전일 비교: [ARCH-01] R6에 따라 금지한다.
- 센서 값만으로 의료적 수면 단계나 진단을 추정한다.

## 시스템 경계

```text
Arduino / NU-40 DK
  └─ 앱 소비 NUS: HELLO, LUX, LUX:BASE, STATE, SLEEPING
                │
                ▼
mobile/ (RN, BLE 단독 소유)
  ├─ BLE transport + line buffer + reconnect policy
  ├─ RSSI estimate ── standby/face screen transition
  ├─ lux parser ── minute aggregate ── SQLite([CON-02f1])
  ├─ WebView host ── [CON-02f] ── app/ (PWA 얼굴)
  └─ tracker screens ◀──────────── SQLite query
```

핵심은 **BLE 연결이 하나뿐**이라는 점이다. WebView에서는 `navigator.bluetooth`를 호출하지 않는다. RN이 원본 NUS 라인을 순서대로 전달하고 PWA는 기존 [CON-01] 파서를 재사용한다. 다른 세션이 소유한 NU40 펌웨어와 [CON-01]은 이 앱 작업에서 수정하지 않는다.

## 폴더와 소유권

| 경로 | 소유 | 내용 | 금지 |
|---|---|---|---|
| `app/` | PWA 담당자 | 눈·표정·WebView 어댑터 | RN BLE/DB 코드 import |
| `mobile/` | RN 담당자 | 앱 셸·BLE·SQLite·트래커 UI | `app/` 소스 직접 수정 |
| `.union-stack/reference/contracts/` | 양측 합의 | BLE·브리지·기록 스키마 | 각 폴더에서 별도 규격 재정의 |

`mobile/` 내부 권장 경계는 `src/ble/`, `src/webview/`, `src/tracker/`, `src/db/`, `src/screens/`다. BLE 수신과 DB 쓰기는 화면 컴포넌트 수명에 묶지 않는다. 화면이 재렌더되거나 이동해도 연결과 기록 세션은 유지돼야 한다.

PWA 공급 방식은 개발과 릴리스를 분리한다.

- 개발: 배포된 HTTPS URL 또는 로컬 개발 URL을 WebView가 읽어 두 담당자가 독립 작업한다.
- 릴리스: R8을 위해 검증된 PWA 빌드를 앱 자산으로 포함하는 방식을 우선한다. 현재 WebView의 로컬 다중 파일 로딩은 플랫폼 차이가 있으므로, 단일 번들 산출물 또는 빌드 복사 절차를 먼저 스파이크한다.
- `mobile/` 아래에 복사된 PWA는 **생성 산출물**이며 손으로 편집하지 않는다. 소스 오브 트루스는 항상 `app/`다.

## 권장 기술 기반

초기 스파이크는 TypeScript 기반 Expo Development Build로 진행한다. BLE는 커스텀 네이티브 코드가 필요하므로 Expo Go를 개발 기준으로 삼지 않는다.

| 역할 | 후보 | 선택 이유 / 확인할 것 |
|---|---|---|
| RN 빌드 | Expo Development Build | 네이티브 모듈을 포함한 실제 앱으로 개발·배포 가능 |
| WebView | `react-native-webview` | RN↔웹 문자열 메시지와 JS 주입 지원 |
| BLE central | `react-native-ble-plx` | NUS scan/connect/notify/write와 iOS restoration 지원. 선택한 Expo/RN 버전과 실기 호환을 첫 스파이크에서 확인 |
| 로컬 기록 | `expo-sqlite` | 앱 재시작 뒤에도 세션·집계 기록 유지 |
| 화면 유지 | `expo-keep-awake` | 전용 폰의 검은 대기 화면과 얼굴 화면에서 화면 잠금을 막는다. 배터리·발열은 밤샘 실측 |

버전 숫자는 문서에 고정하지 않는다. 스캐폴드 시점의 호환 버전을 lockfile에 고정하고, 보드 연결 스파이크를 통과한 조합만 채택한다.

## 데이터 흐름

### 조도 → 눈

1. RN이 TX characteristic의 notify 바이트를 받아 `\r`/`\n` 기준으로 64바이트 이하 라인을 복원한다([CON-01]).
2. RN은 라인을 자체 sequence와 수신 시각으로 감싸 [CON-02f] `ble/line`으로 전달한다.
3. PWA 어댑터는 `LUX:*`, `STATE:*`, `SLEEPING`, `HELLO`를 기존 `handleLine()`에 넣는다.
4. 이산 눈 상태는 보드의 `STATE:`만 결정하고, `LUX:`는 연속 표정만 바꾼다([CON-01] 규칙 1·2).

### 앱 시작·BLE 연결 → 얼굴 화면

RN은 snapshot·line 구독을 모두 등록한 뒤 `connect()`를 자동 호출한다. `connect()`는 scanning·connecting·connected 상태에서 멱등이므로 개발 StrictMode의 중복 effect도 새 scan을 만들지 않는다. `connected` snapshot은 현재 화면과 관계없이 `face`로 전환한다.

RSSI 필터는 진단 화면에 남기되 얼굴 진입을 지연시키지 않는다. 권한 거부·Bluetooth OFF·scan timeout은 `error`로 연결 화면을 보여주고 사용자가 재시도할 수 있다.

런타임이 `SLEEPING`을 받은 뒤에는 `ended`→검은 `STANDBY`로 유지한다. 이 상태에서 RSSI가 강해져도 화면·알림·진동을 만들지 않는다([ARCH-01] R4).

앱이 다른 앱 뒤나 잠금 화면에 있으면 Android/iOS 정책상 강제 전면 실행을 제품 계약으로 삼지 않는다. 전용 Android 폰은 앱을 전경에 둔 채 검은 화면을 렌더해 이 제약을 피한다. 사용자가 앱을 이탈한 동안 네이티브 BLE 서비스는 기록만 유지하고, 얼굴은 다음 사용자 복귀 시 표시한다.

### 조도 → 기록

RN은 `LUX:<정수>` 수신 시각을 붙여 메모리의 현재 분 버킷에 `count/mean/min/max`를 누적한다. 분 경계와 앱 생명주기 전환에서 [CON-02f1] SQLite repository에 멱등 upsert한다. `LUX:`가 기대 주기보다 오래 끊긴 구간은 `gapMs`로 남기며, 원본 5Hz 표본은 영구 저장하지 않는다.

## RN 화면

1. **시작 연결 상태** — 앱이 자동 scan/connect한다. 권한 거부·Bluetooth OFF·timeout일 때만 연결 화면에 재시도 버튼을 보여준다.
2. **검은 대기 화면** — 정상 수면 종료나 사용자의 명시적 얼굴 이탈 뒤에만 사용한다. 앱 시작의 기본 경유 화면이 아니다.
3. **팰 얼굴** — 전체 화면 WebView. 프로덕션에서는 RSSI·거리·센서 수치와 디버그 문자를 노출하지 않는다([ARCH-01] R3·R6).
4. **수면 기록 중** — [ARCH-01] R4에 따라 검은 화면을 유지하고 알림·진동을 만들지 않는다. 내부 수집 상태만 유지한다.
5. **아침 일기** — 시간대별 조도 환경과 센서 gap을 사실로 보여준다. 점수·등급·전일 비교는 없다.
6. **개발 진단 화면** — packet rate, RSSI raw/filtered, 마지막 line, drop/gap, DB write 상태. 릴리스 동선에서는 숨긴다.

## 전경·백그라운드 범위

첫 구현은 **전용 Android 폰 + 앱 전경 유지 + 검은 대기 화면**을 검증 기준으로 확정한다. 이는 기존 Android Chrome 데모 자산을 보존하면서 일반 앱의 백그라운드 Activity 실행 제한을 피하는 경로다. iOS를 영구 제외한다는 뜻은 아니지만 첫 exit gate에는 넣지 않는다.

화면 잠금 또는 다른 앱 전환 중에도 8시간 BLE 기록이 필요할 때만 별도 네이티브 작업으로 승격한다. 이 경로는 데이터를 유지할 뿐 앱 화면을 강제로 전면에 띄우지 않는다.

- Android: 장기 notify 수신은 `CompanionDeviceService` 또는 `connectedDevice` 유형 foreground service 검토가 필요하다. OS가 표시하는 지속 알림과 [ARCH-01] R4의 제품 표현 경계도 인간 확인이 필요하다.
- iOS: `bluetooth-central` background mode, service UUID 지정 scan, Core Bluetooth state restoration이 필요하다. OS가 프로세스를 중단할 수 있으므로 "항상 8시간"을 문서만으로 보장하지 않고 실기 증거로 판정한다.

따라서 백그라운드는 일반 JS 타이머 패키지 하나로 해결됐다고 간주하지 않는다. BLE callback에서 즉시 짧게 기록하고 UI와 분리한다.

## 구현 순서와 통과 증거

| 단계 | 산출물 | 다음 단계 진입 조건 |
|---|---|---|
| 0. 앱 계약 동결 | [CON-01] 읽기 + 보드 세션 샘플 NUS 로그 | NU40·조도 전용 확인, 앱에서 펌웨어 변경 0 |
| 1. RN 기반 | `mobile/` Development Build | Android 실기 설치, BLE 권한 화면 진입 |
| 2. BLE 생명선 | mount 자동 scan/connect + notify/write + line buffer | 앱 cold start→자동 연결→얼굴, 보드 `HELLO` 및 기존 `LUX:` 15분 연속 수신, chunk 분할 테스트 통과 |
| 3. 근접 추정 | RSSI 필터 + 검은 대기 화면 | `VERY_NEAR 추정` 유지 조건 통과, SLEEP/NIGHT 화면 점등 0 |
| 4. WebView 브리지 | [CON-02f] 양방향 어댑터 | 불을 가리면 3초 안에 눈 반응, Web Bluetooth 호출 0 |
| 5. 조도 저장 | [CON-02f1] SQLite migration + repository | 재실행 후 분 버킷 보존, 5Hz 원본 row 0 |
| 6. 기록 화면 | 아침 일기/타임라인 | R2·R4·R6 검수 통과, 실제 센서 기록 1회 렌더 |
| 7. 밤샘 | 배터리·발열·packet gap 계측 | 8시간 세션 1회, 유실률과 중단 사유 보고 |
| 8. 백그라운드 기록(필요 시) | Android native lifecycle | 앱 이탈 중 데이터 보존; 자동 화면 전면 실행은 수용 기준에서 제외 |

테스트는 BLE transport를 인터페이스로 감싸 fake line source로도 실행한다. 최소 회귀는 ① notify chunk가 메시지 중간에서 잘려도 복원 ② 여러 줄이 한 chunk에 와도 순서 유지 ③ 알 수 없는 라인 무시 ④ WebView ready 전 최신 상태 재전달 ⑤ 동일 세션 재시작 시 중복 row 방지 ⑥ DB migration 보존이다.

## 동시 세션 경계

- 보드 세션: `NU40_Basic_Test/`·펌웨어·실기 로그·[CON-01] 후보 변경. 앱 세션은 침범하지 않는다.
- 앱 세션: `mobile/`·[PLAN-02f]·[CON-02f]·[CON-02f1]. 보드 메시지는 기존 계약을 소비하고 알 수 없는 라인은 무시한다.
- 보드 메시지 변경은 다른 세션이 [CON-01]에 반영한 뒤 앱이 따라간다. 양쪽이 같은 문법을 각자 만들지 않는다.

## 근거 자료 (2026-08-22 확인)

- React Native WebView Guide — JS/native 통신과 로컬 HTML의 플랫폼 차이: https://github.com/react-native-webview/react-native-webview/blob/master/docs/Guide.md
- Expo Development Builds — 커스텀 네이티브 라이브러리는 Development Build 필요: https://docs.expo.dev/develop/development-builds/introduction/
- react-native-ble-plx — NUS에 필요한 central/notify/write와 background 설정: https://github.com/dotintent/react-native-ble-plx
- Expo SQLite — 재시작 후에도 유지되는 로컬 DB: https://docs.expo.dev/versions/latest/sdk/sqlite/
- Android BLE background guide: https://developer.android.com/develop/connectivity/bluetooth/ble/background
- Android background Activity 제한: https://developer.android.com/guide/components/activities/secure-bal
- Bluetooth RSSI는 coarse ranging, Channel Sounding은 fine ranging: https://www.bluetooth.com/learn-about-bluetooth/feature-enhancements/channel-sounding/
- Apple Core Bluetooth background processing: https://developer.apple.com/library/archive/documentation/NetworkingInternetWeb/Conceptual/CoreBluetooth_concepts/CoreBluetoothBackgroundProcessingForIOSApps/PerformingTasksWhileYourAppIsInTheBackground.html
