---
id: WO-02f-4
title: RN 시작 자동 BLE 연결과 얼굴 진입
status: Verifying
parent: PLAN-02f
evidence: "mobile startup 정책 포함 Jest 20/20 · tsc --noEmit · expo-doctor 21/21 통과; Android cold start 실기 미완"
closed_by: []
---

# [WO-02f-4] 시작 자동 연결 → 얼굴

## 목표

앱을 켜면 연결 버튼 없이 `SLEEPPAL-*` NU40을 자동 탐색·연결하고, 연결 성공 즉시 PWA 얼굴 화면으로 진입한다. 권한 거부·Bluetooth OFF·scan timeout일 때만 연결 화면을 재시도 폴백으로 보여준다.

## 수용 기준

- [x] BLE snapshot·line 구독을 등록한 뒤 앱 mount에서 `connect()`를 한 번 호출한다
- [x] `connect()`의 기존 멱등 가드로 scanning/connecting/connected 중 중복 scan을 막는다
- [x] `connected` snapshot은 현재 화면과 무관하게 `face`로 전환한다
- [x] `ended`는 `standby`, `error`는 수동 재시도 가능한 `connect`로 전환한다
- [x] 얼굴 WebView는 기존 [CON-02f] ready/replay와 [CON-01b] 표정 프로토콜을 그대로 사용한다
- [ ] Android cold start에서 권한 승인→NU40 자동 연결→얼굴 표시를 실기로 확인한다

## 증거

startup 정책 포함 Jest 20/20, TypeScript, Expo Doctor 21/21을 통과했다. 완료 시 Android cold-start 영상을 추가한다.
