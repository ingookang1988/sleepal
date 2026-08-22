<!-- [Raw/분석] GitHub issue #5의 NU40 NFC 자동 진입 타당성 검토. append-only. -->
---
id: ANL-02g
title: issue #5 — NU40 NFC 거치 자동 진입 타당성
date: 2026-08-22
source: https://github.com/ingookang1988/sleepal/issues/5
---

# [ANL-02g] issue #5 — NFC 타당성

## 확인된 사실

1. **핀은 노출돼 있다.** NU40-DK 회로도와 V2 회로도에서 nRF52840 `P0.09/NFC1`, `P0.10/NFC2`가 헤더 `P2-22/23`까지 이어진다. NUCODE Arduino variant도 `PIN_NFC1=9`, `PIN_NFC2=10`을 정의한다.
2. **온보드 NFC 안테나는 없다.** 두 회로도에는 NFC 루프·매칭 네트워크가 없으므로 외부 안테나와 물리 정렬이 필요하다.
3. **현재 Arduino BSP에는 완성 T2T/NDEF 계층이 없다.** fork에는 NFCT HAL header는 있지만 Type 2 Tag/NDEF 라이브러리·예제는 없고, 포함된 NFC 예제는 NFC 핀을 GPIO로 바꾸는 UICR 도구뿐이다. 보드 에뮬레이션은 스케치 몇 줄 작업이 아니다.
4. **issue의 System OFF 전제는 틀렸다.** Nordic 공식 `samples/nfc/system_off`는 NFCT SENSE를 켠 뒤 System OFF에 들어가고, NFC field로 MCU를 깨운 뒤 태그를 재초기화해 읽히는 경로를 제공한다. 따라서 “보드가 자는 동안 NFC는 불가능”은 아키텍처 제약이 아니다.
5. **URI 선택은 제품 동작을 바꾼다.** `sleepal://...` custom scheme은 설치 앱만 열고 미설치 PWA 폴백이 없다. HTTPS NDEF + verified App Link는 설치 시 RN, 미설치 시 브라우저/PWA 경로를 만들 수 있다. Android 16은 NFC 웹 링크를 `ACTION_VIEW`로 바꾸며 Android 17은 사용자 확인 알림을 요구하므로 무조건 자동 실행을 영구 보장할 수 없다.

## 결론

- 1차 제품 경로는 **수동 NTAG + HTTPS verified App Link**다. 전원·BSP·부팅 타이밍과 독립적이고 issue의 RN/PWA 폴백 목표를 그대로 만족한다.
- NU40 NFCT 에뮬레이션은 **가능성 있음**이지만 별도 스파이크다. 외부 안테나, `NFCPINS` NFC 모드, T2T/NDEF 라이브러리, SoftDevice/BLE 공존, System OFF field wake 후 첫 읽기 성공률을 실기로 통과해야 한다.
- custom scheme 기반의 현재 [CON-02g] 초안과 모바일 미커밋 코드는 계약 후보가 아니다. HTTPS host·App Link association·서명 인증서가 정해진 뒤 맞춘다.

## 근거

- NU40-DK 회로도: https://github.com/chcbaram/nu40dk/blob/main/hardware/NU40DK_Schematic.pdf
- NU40-DK V2 회로도: https://github.com/chcbaram/nu40dk/blob/main/hardware/NU40-DK-V2-Basic.pdf
- NUCODE Arduino variant: https://github.com/Nucode01/Adafruit_nRF52_Arduino/blob/master/variants/nu40dk_nrf52840/variant.h
- Nordic NFC System OFF sample: https://github.com/nrfconnect/sdk-nrf/tree/main/samples/nfc/system_off
- Android NFC tag dispatch: https://developer.android.com/develop/connectivity/nfc/nfc
