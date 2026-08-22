---
id: WO-02g-2
title: NU40 NFCT Type 2 Tag 에뮬레이션 스파이크
status: Draft
parent: PLAN-02g
evidence: "none — 타당성 분석만 완료, 하드웨어 스파이크 미착수"
closed_by: []
---

# [WO-02g-2] NU40 NFCT 에뮬레이션 스파이크

## 목표

NU40-DK가 외부 안테나로 [CON-02g] NDEF URI를 제공하고, System OFF 상태의 NFC field에서 깨어나 실제 Android 폰에 읽히는지 격리 검증한다.

## 수용 기준

- [ ] 실물 보드에서 P2-22/23이 P0.09/NFC1·P0.10/NFC2인지 연속성 또는 제조사 도면으로 확인한다
- [ ] `NRF_UICR->NFCPINS`가 NFC mode인지 읽기만 하고, GPIO로 바꾸는 one-way 예제는 실행하지 않는다
- [ ] 대상 안테나·매칭 부품·폰 코일 정렬을 기록한다
- [ ] 현재 NUCODE Arduino BSP에서 T2T/NDEF 제공 계층과 라이선스·SoftDevice 공존 경로를 확정한다
- [ ] 깨어 있는 상태에서 HTTPS NDEF 20회 연속 읽기 성공률을 기록한다
- [ ] NFCT SENSE 후 System OFF→field wake→동일 NDEF 읽기 20회 성공률과 첫 읽기 지연을 기록한다
- [ ] BLE NUS와 NFCT를 함께 켠 빌드가 컴파일·연결되며 `STATE/SLEEPING` 경로를 깨지 않는다
- [ ] 실패해도 [WO-02g-1] 수동 태그 경로에는 변경이 없다

## 증거

완료 시 회로/안테나 사진, UICR readout, 빌드 로그, awake/System OFF 각 20회 결과표, Android NDEF dump를 남긴다.
