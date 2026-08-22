---
id: WO-01a-2
title: Pillow Node — CON-01 상태·조도·릴리스 정합
status: Draft
parent: PLAN-01a
evidence: "partial — raw IMU 기본 OFF/개발 flag 코드, Arduino 기본·flag 빌드 성공, 정지 brightness 1872~1882; 의도 LUX step·실기 상태 전이는 미검증"
closed_by: []
---

# [WO-01a-2] Pillow Node 프로토콜 정합

## 목표

issue #5의 보드 갭을 [ANL-01a] 순서대로 닫아, 조도 반응부터 물리 버튼 기상까지 [CON-01] 한 사이클을 NU40 실기로 성립시킨다.

## 수용 기준

- [x] `IMU:`는 릴리스 기본 OFF이고 명시적 개발 플래그에서만 송신된다
- [ ] 가림·사무실·직접 조사 왕복 5회와 정지 잡음 30초를 wire 값·stop으로 기록한다
- [ ] 실측 분포가 분리되면 PWA의 board source 전용 문턱만 조정한다; 분리되지 않으면 [CON-01] 매핑 변경을 코드보다 먼저 작성한다
- [ ] 상대 조도+히스테리시스+지속시간으로 `AWAKE→DROWSY→ASLEEP`을 보드가 판정한다
- [ ] 전이와 BLE 재연결 때 현재 `STATE:`가 전달된다
- [ ] 후광 소등 뒤 `SLEEPING`을 보내고 System OFF에 진입한다
- [ ] System OFF 뒤 `WAKE` BLE write가 아니라 물리 버튼으로 기상해 재연결 `HELLO`→MORNING이 성립한다
- [ ] Pillow Node 미지원 `LED/TILT/SHAKE`는 릴리스 UI에서 노출되지 않고, 수신해도 런타임이 죽지 않는다
- [ ] 펌웨어 컴파일, 얼굴 회귀 게이트, RN parser/line-buffer 테스트가 통과한다
- [x] 표정 브랜치를 먼저 최신 `main`에 정합·병합한 뒤 PR #4를 rebase하고 HANDOFF 충돌을 현재 사실로 수동 통합한다
- [x] 루트 `packageManager=pnpm` 우발 변경을 제거해 Harness CI가 setup-node를 통과하고 전체 gate가 green이다

## 증거

현재 기본 빌드 137,564B/16,068B와 `compiler.cpp.extra_flags=-DSLEEPAL_SEND_RAW_IMU=1` 빌드 137,756B/16,072B가 통과했다. 정지 baseline은 1892, brightness는 1872~1882였으며 의도 step은 아직 없다. 완료 시 LUX 실측 표, `STATE/SLEEPING/disconnect/button/HELLO` 시리얼·RN 로그, 얼굴 및 RN 테스트 결과를 추가한다.
