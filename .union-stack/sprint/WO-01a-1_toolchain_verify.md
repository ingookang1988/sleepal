---
id: WO-01a-1
title: 라이브러리 설치와 컴파일 검증 — 집 와이파이에서
status: Draft
parent: PLAN-01a
evidence: "none — 미착수 (완료 시: Done compiling 콘솔 캡처)"
closed_by: []
---
# [WO-01a-1] 툴체인 컴파일 검증

**5시간짜리 해커톤에서 가장 많은 팀이 날려먹는 구간을 오늘로 옮긴다.** BSP는 arm-none-eabi-gcc·nrfjprog·CMSIS를 함께 받아 수백 MB다. 행사장 와이파이에 100명이 몰린 상태에서 시작하면 오전을 통째로 날린다.

## 목표
내일 보드를 손에 쥔 뒤 **3분 안에 첫 업로드가 성공하는 상태.**

## 수용 기준
- [ ] Arduino IDE 2.x 설치
- [ ] 보드매니저 URL 등록 — **직접 타이핑하지 말고 복사·붙여넣기**(줄바꿈이 섞이면 IDE가 조용히 무시한다)
  `https://raw.githubusercontent.com/Nucode01/Adafruit_nRF52_Arduino/refs/heads/master/package_nuduino_index.json`
- [ ] BSP 설치 — `NUBoards nRF52` (1.0.2). 목록에 INSTALLED 뱃지
- [ ] 보드 선택 — `NUBoards nRF52 > NU40DK nRF52840` (보드 없어도 선택은 된다)
- [ ] Blink 스케치 **Verify** 성공 — 콘솔에 `Sketch uses ... bytes` + `Done compiling`
- [ ] **`BH1750` 라이브러리 설치 + 컴파일** — 내일 라이브러리 매니저 검색은 시간 낭비
- [ ] `i2c_scan.ino` 컴파일 통과
- [ ] `toython_ble.ino` 컴파일 검증 — **아직 한 번도 컴파일된 적이 없다**([CON-01] §미검증)
- [ ] `DEVICE_NAME`을 `"TOYTHON-01"` 기본값에서 **팀 고유값으로 변경.** 100명이 모이면 이름이 충돌한다
- [ ] USB-C **데이터** 케이블 확보(충전 전용이면 포트가 안 뜬다)

## 알아둘 것
업로드가 막히면 **RESET 더블탭 → 맥박 LED → 포트 재선택.** UF2 부트로더라 `BARAM-NU40` 드라이브로도 잡히므로, IDE가 말썽이면 `.uf2` 드래그가 비상 탈출구다.

## 증거
`Done compiling` 콘솔 캡처 4건(blink · i2c_scan · toython_ble · BH1750 포함 스케치).
