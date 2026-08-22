---
id: WO-02g-1
title: 수동 NFC 태그 — RN App Link와 PWA 폴백
status: Draft
parent: PLAN-02g
evidence: "none — custom-scheme 프로토타입은 비후보로 격리; HTTPS App Link 구현 미착수"
closed_by: []
---

# [WO-02g-1] 수동 NFC App Link

## 목표

수동 Type 2 태그 하나로 설치된 RN 앱과 미설치 PWA를 같은 HTTPS URI에서 분기한다.

## 수용 기준

- [ ] 배포 host와 `/nfc/v1/wake` route를 정하고 [CON-02g] placeholder를 실제 값으로 바꾼다
- [ ] host의 `assetlinks.json`이 실제 배포 APK 서명 SHA-256과 `com.sleepal.mobile`을 검증한다
- [ ] Android manifest가 구버전 `NDEF_DISCOVERED`와 Android 16+ `VIEW` App Link를 같은 URI로 처리한다
- [ ] URI parser가 scheme·host·path·device allowlist 밖 입력을 거부한다
- [ ] cold start와 warm start가 얼굴 화면+BLE connect를 중복 없이 한 번만 호출한다
- [ ] 앱 설치 상태에서는 RN, 미설치 상태에서는 PWA가 열린다
- [ ] force-stop·NFC OFF·잠금·Android 17 사용자 확인 한계를 사용자 오류로 오인하지 않는다
- [ ] 실제 NTAG와 대상 Android 폰으로 RF 태깅을 검증한다; `adb am start`만으로 닫지 않는다

## 증거

현재 `mobile/src/nfc/`와 config plugin은 custom-scheme 프로토타입이며 앱 설정에 연결하지 않는다. 완료 시 실제 태그 NDEF dump, `assetlinks.json` 검증, 설치/미설치·cold/warm 4경로 영상 또는 로그, 관련 모바일 테스트를 남긴다.
