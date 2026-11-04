<!-- [Wiki] 작업 지시. 상태 정본은 이 frontmatter `status:` 하나뿐이다([up:PRO-15]). scaffold 생성 — 선택 절(배경·설계·절차)은 필요할 때만 추가. -->
---
id: WO-02f-2
title: 밤샘 검증 — 30분 예비 런 → 8시간 LUX 수신율·gapMs·배터리·SLEEPING 종료
status: Draft
parent: PLAN-02f
evidence: "none — 착수 전"
closed_by: []
version: 1.0
---
# [WO-02f-2] 밤샘 검증 — 30분 예비 런 → 8시간 LUX 수신율·gapMs·배터리·SLEEPING 종료

## 목표
[PLAN-02f] 단계 7(밤샘). [WO-02f-1]이 Galaxy S22 실기로 연 수직 슬라이스를 **시간축**으로 검증한다 — 30분 예비 런으로 `LUX:` 수신율·`gapMs`·배터리·발열·`SLEEPING` 정상 종료를 먼저 보고, 통과 시 8시간 런으로 확장한다. 실기(NU40 + Galaxy S22)가 필요하므로 클라우드 세션은 계측 로깅·진단 화면 준비까지만 맡는다.


## 수용 기준
- 30분 예비 런: `LUX:` 수신율과 `gapMs` 분포(5Hz 데드밴드 기준 유실률)·배터리 %·발열 체감을 개발 진단 화면/로그로 기록한다 ([CON-02f1] `sensor_gap`).
- `SLEEPING` 수신 → `ble/status.state="ended"` 정상 종료, 자동 재연결 0 ([CON-01] 규칙 4, [CON-02f]).
- 8시간 런 1회: 분 버킷이 세션 전체에 걸쳐 보존되고 5Hz 원본 row 0, 중단 시 사유를 `SensorEvent`로 남긴다.
- SLEEP/NIGHT 구간 화면 점등·알림·진동 0 ([ARCH-01] R4).
- `IMU:`/`MOVE:`는 여전히 무시(조도 전용 범위 유지) — 확장은 별도 WO.

## 증거
- 닫을 때 frontmatter `evidence:` 에 값 또는 `none — 이유`(선언 검사가 있으면 `rcpt:<name>@<sha>`). 상위 축 흔적은 `closed_by:`.
