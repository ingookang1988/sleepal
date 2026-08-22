<!-- [Schema/계약·행위] NFC 거치 자동 진입 계획 초안. 근거 [ANL-02g], 계약 [CON-02g]. -->
---
id: PLAN-02g
title: NFC 거치 — RN 앱 또는 PWA 진입
status: Draft
tier: draft
parent: PLAN-02
version: 0.1
---

# [PLAN-02g] NFC 거치 자동 진입

## 목표

Android 폰을 거치 위치에 대면 설치된 RN 앱을 열고, 앱이 없으면 PWA로 이어진다. NFC는 진입 신호일 뿐 인증·사용자 식별·BLE 주소 전달 경로가 아니다.

## 합의할 구현 축

### 기준 경로 — 수동 태그

- NFC Forum Type 2 수동 태그에 [CON-02g] HTTPS URI 한 건을 기록한다.
- 동일 URI를 Android verified App Link와 PWA route가 함께 소비한다.
- RN은 cold/warm start에서 URI를 검증한 뒤 얼굴 화면과 기존 BLE 연결을 멱등 호출한다.
- 앱 미설치·링크 미검증·향후 Android 정책 변경 때도 브라우저/PWA 또는 사용자 확인으로 퇴화해야 한다.

### 실험 경로 — NU40 NFCT

- [ANL-02g]의 핀·BSP 분석을 출발점으로 외부 안테나와 Type 2 Tag 계층을 스파이크한다.
- System OFF 중에도 NFCT SENSE로 field wake가 가능하므로, 수동 태그를 “보드가 자서 필요”하다고 설명하지 않는다. 수동 태그의 이유는 구현 단순성·무전원·배포 안정성이다.
- 실험이 수동 태그와 같은 URI·성공률을 보일 때만 대체 가능하다. URL 갱신 편의만으로 BSP/안테나 리스크를 제품 경로에 넣지 않는다.

## 구현 순서

1. [WO-02g-1] HTTPS host·App Link·PWA fallback·수동 태그를 먼저 수직 검증한다.
2. [WO-02g-2] NU40 NFCT를 독립 스파이크하고, 실패해도 1번을 훼손하지 않는다.
3. 둘 중 배포 경로를 고른 뒤 [CON-02g]의 placeholder host를 실제 값으로 고정한다.

## 비목표

- NFC 태그를 신뢰 토큰으로 사용
- 백그라운드/force-stop 상태에서 Android 정책을 우회해 무조건 화면을 띄움
- NFC 탭만으로 BLE 대상의 진위를 보장
- iOS 자동 실행 보장
