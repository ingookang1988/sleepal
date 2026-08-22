---
id: WO-02f-1
title: RN 조도 수직 슬라이스 — NU40 BLE → SQLite → PWA WebView
status: Closed
parent: PLAN-02f
evidence: "mobile: Jest 13/13 · tsc · expo-doctor 21/21 · Gradle assembleDebug 489 tasks · Galaxy S22 APK 설치 · NU40 SLEEPPAL-PILLOW-01 GATT/NUS notify · LUX:2344 · RSSI -66 · 로컬 PWA 얼굴 · SQLite 14:36~14:38 조도 버킷 3개 실기"
closed_by: [".union-stack/feature/live.md"]
---

# [WO-02f-1] RN 조도 수직 슬라이스

## 목표

`mobile/`에 Android 우선 RN 앱을 만들고 NU40 NUS 조도 라인을 수신해 PWA 얼굴과 로컬 조도 기록에 동시에 연결한다. 다른 세션이 소유한 펌웨어와 [CON-01]은 수정하지 않는다.

## 수용 기준

- [x] Expo TypeScript Development Build + `react-native-ble-plx` + `react-native-webview` + `expo-sqlite` 구성
- [x] NU40 scan/connect/notify/write, 64바이트 line buffer, `SLEEPING` 정상 종료 처리
- [x] `LUX:` 파싱 → [CON-02f] `ble/line` WebView 전달
- [x] [CON-02f1] SQLite migration + 분 단위 `count/mean/min/max/gapMs` 멱등 upsert
- [x] 연결·검은 대기·PWA 얼굴·조도 기록/개발 진단 화면
- [x] RSSI는 `VERY_NEAR 추정`으로만 표시하고 정확한 거리나 10cm를 주장하지 않음
- [x] parser/line buffer/bridge/bucket 단위 테스트와 TypeScript 검사 통과
- [x] `NU40_Basic_Test/` 및 보드 펌웨어 변경 0

## 증거

Galaxy S22에서 APK 설치, NU40 NUS notify, 조도 수신, 로컬 PWA 얼굴, SQLite 조도 타임라인까지 확인했다. `SLEEPING` System OFF 실기와 장시간 5Hz 유실률은 후속 밤샘 검증 범위다.
