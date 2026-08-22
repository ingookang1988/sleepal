<!-- [Schema/계약·상태] NFC NDEF 태그 ↔ Android RN 앱/PWA 진입 계약 초안. -->
---
id: CON-02g
title: NFC NDEF 앱 깨우기 프로토콜
status: Draft
tier: draft
version: 0.2
consumers: [PLAN-02g, PLAN-02f]
---

# [CON-02g] NFC NDEF 앱 깨우기 프로토콜

## 존재와 구현 경계

거치 위치의 NFC 태그는 HTTPS NDEF URI 한 건을 제공한다. 설치된 Android 앱은 verified App Link로, 미설치 폰은 브라우저/PWA로 같은 URI를 소비한다. 수동 NTAG가 기준 구현이고 NU40 NFCT 에뮬레이션은 [WO-02g-2]가 통과한 뒤 같은 payload를 제공할 수 있다.

현재 `mobile/src/nfc/protocol.ts`의 `sleepal://` custom scheme 구현은 앱 미설치 PWA 폴백이 없어 v0.2 비준 후보가 아니다. 실제 HTTPS host와 APK 서명 association이 정해질 때까지 이 문서는 Draft다.

## NDEF 레코드

| 필드 | 값 |
|---|---|
| TNF | NFC Forum well-known (`0x01`) |
| Type | URI RTD `U` (`0x55`) |
| URI prefix byte | `0x00` — 접두사 압축 없음 |
| URI | `https://<verified-app-link-host>/nfc/v1/wake?device=SLEEPPAL-PILLOW-01` |

`device`는 ASCII 영문 대문자·숫자·하이픈만 허용하며 1–32바이트이고 BLE 광고 이름과 같아야 한다. NFC에
BLE MAC, 인증 토큰, 사용자 ID, 비밀값을 넣지 않는다. 태그 값은 누구나 읽고 복제할 수 있다.

`<verified-app-link-host>`는 placeholder다. 실제 태그를 기록하기 전에 [WO-02g-1]에서 `assetlinks.json`과 PWA route가 함께 배포된 host로 고정하고 이 문서 버전을 올린다.

## Android 호출

```text
action   Android 15 이하: android.nfc.action.NDEF_DISCOVERED
         Android 16 이상: android.intent.action.VIEW
data     https://<verified-app-link-host>/nfc/v1/wake?device=SLEEPPAL-PILLOW-01
activity com.sleepal.mobile/.MainActivity (singleTask)
```

- cold start: RN `Linking.getInitialURL()`로 읽는다.
- background/warm: `MainActivity.onNewIntent()` → RN `Linking` `url` 이벤트로 읽는다.
- 유효한 태그면 얼굴 화면을 열고 기존 NUS BLE 연결을 멱등 호출한다.
- scheme·host·version·action·device 중 하나라도 다르면 앱은 아무 동작 없이 버린다. 웹 route는 잘못된 query를 안전한 기본 화면으로 보낸다.
- 강제 종료(force-stop)된 앱, NFC가 꺼진 폰, OEM 잠금 정책은 자동 진입을 보장하지 않는다.

앱 manifest는 동일 URI에 대해 구버전 `NDEF_DISCOVERED` filter와 `VIEW`+`BROWSABLE`+`autoVerify` App Link filter를 함께 둔다. Android 17부터 웹 링크 NFC는 사용자 확인 알림이 필요하므로 “거치만으로 영구 무조건 자동 실행”을 보장하지 않는다.

## 태그 구현 규칙

- 수동 태그는 기준 경로다. 전원·보드 상태와 독립적으로 같은 URI를 제공한다.
- NU40-DK의 P0.09/NFC1·P0.10/NFC2는 헤더 P2-22/23에 노출되지만 온보드 안테나는 없다([ANL-02g]). 외부 안테나·매칭·T2T/NDEF 계층이 필요하다.
- nRF52840은 NFCT SENSE 상태에서 System OFF의 NFC field wake가 가능하다. “System OFF라 NFC가 안 된다”를 수동 태그의 근거로 쓰지 않는다.
- `NRF_UICR->NFCPINS`를 읽어 NFC mode를 확인한다. NFC→GPIO 전환 예제는 one-way UICR 변경이므로 이 작업에서 실행하지 않는다.

## 개발 호출 예

```bash
adb shell am start -W \
  -a android.intent.action.VIEW \
  -c android.intent.category.BROWSABLE \
  -d 'https://<verified-app-link-host>/nfc/v1/wake?device=SLEEPPAL-PILLOW-01' \
  com.sleepal.mobile/.MainActivity
```

이 호출은 Android intent 라우팅을 검증할 뿐 RF/NDEF 물리 읽기를 증명하지 않는다. 물리 태그
검증은 화면을 켠 실제 Android 폰에서 앱을 background로 보낸 뒤 태깅해 판정한다.
