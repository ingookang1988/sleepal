<!-- [Raw/분석] GitHub issue #5의 보드-앱 계약 정합 검토. append-only. -->
---
id: ANL-01a
title: issue #5 — Pillow Node와 BLE 계약의 구현 갭
date: 2026-08-22
source: https://github.com/ingookang1988/sleepal/issues/5
---

# [ANL-01a] issue #5 — 보드 프로토콜 갭

## 검토 기준

- 대상: `feat/connection-and-sensor`의 `7de9e9b`, 특히 `NU40_Pillow_Node/NU40_Pillow_Node.ino`
- 계약: [CON-01] v0.4, 얼굴 소비부 `app/ble.js`·`app/lux.js`, RN 소비부 [CON-02f]
- 범위: issue #5의 LUX·STATE/SLEEPING·raw IMU·명령·첫 실기 왕복

## 판정

| 이슈 항목 | 판정 | 근거와 영향 |
|---|---|---|
| `LUX:` 다이내믹 레인지 | **재현 가능성이 높은 미검증 갭** | 보고값 1420→1900은 `log2(1900/1420)=0.42 stop`이라 얼굴의 ±2 stop 사건 문턱에 못 미친다. 직접 조사 최대값과 정지 잡음이 없어 문턱/매핑을 아직 정할 수 없다 |
| `STATE:`·`SLEEPING` | **확정 결함** | 펌웨어는 둘을 송신하지 않고 System OFF에도 들어가지 않는다. [PLAN-01a]·[CON-01]의 핵심 루프가 빠져 있다 |
| 상태 판정 주체 | **보드 유지** | 보드가 후광·눈의 이산 상태와 System OFF를 한 축으로 묶어야 R8이 성립한다. RN의 [CON-02] 4모드는 UX 모드이며 보드의 3상태를 대체하지 않는다 |
| `SEND_RAW_IMU=true` | **확정 계약 위반** | 릴리스에서도 10Hz 원시 IMU가 송신된다. [CON-01]은 보정용 개발 빌드만 허용한다 |
| `LED/TILT/SHAKE` | **지원 범위 불일치** | RN은 문법을 허용하지만 Pillow Node는 `WAKE`만 처리한다. 얼굴 디버그 UI가 성공처럼 보인 채 무반응일 수 있다 |
| `WAKE→HELLO` | **배관만 확인 가능** | 현재 코드는 연결 중 `WAKE`에 `HELLO`를 보낸다. 하지만 정상 NIGHT는 `SLEEPING` 직후 System OFF로 BLE가 끊기므로, 실제 아침 경로는 버튼 기상→재광고→재연결→`HELLO`다 |

## 수정 원칙

1. `LUX:` wire 값은 먼저 그대로 둔다. 현재 선형 상대값 계약을 펌웨어에서 임의 감마 변환하면 RN 기록과 PWA가 동시에 의미를 잃는다.
2. 동일 자세 30초 정지 잡음과 `가림↔사무실↔직접 조사` 왕복을 각 5회 기록한다. 의도 동작 stop 분포와 잡음 분포가 분리되면 `app/lux.js`에 **board source 전용** 문턱을 둔다. 전역 ±2 stop은 카메라 회귀 자산 때문에 바꾸지 않는다.
3. 두 분포가 겹치면 그때만 단조 companding을 후보로 올리고 [CON-01]을 먼저 버전업한다. 실측 없이 감마 지수를 정하지 않는다.
4. 보드에 `AWAKE→DROWSY→ASLEEP` 상대 조도·히스테리시스·지속시간 판정을 구현한다. 전이 때와 BLE 재연결 snapshot에 `STATE:`를 보낸다.
5. 잠듦은 후광 소등→`SLEEPING` 송신 완료→System OFF 순서다. 아침 검증은 `WAKE` write가 아니라 물리 버튼 기상으로 한다.
6. raw IMU는 컴파일 플래그 기본 0으로 바꾸고 개발 빌드에서만 명시적으로 켠다.
7. Pillow Node의 RX는 `WAKE`만 필수로 두고 `LED/TILT/SHAKE`는 미지원임을 [CON-01]에 명시한다. RN 릴리스 UI도 해당 명령을 노출하지 않는다.

## 권장 구현 순서

`raw IMU 기본 OFF` → `LUX 실측` → `board 전용 FE 문턱 또는 계약 선행 매핑` → `3상태 판정` → `SLEEPING/System OFF` → `버튼 기상 왕복`.

이 순서를 [WO-01a-2]의 수용 기준으로 고정한다. 상태 소유권을 폰으로 옮기는 계약 변경은 권장하지 않는다.

## 통합 상태 관측 (2026-08-22 추가)

- PR #4는 GitHub 기준 `CONFLICTING/DIRTY`, 최신 `main`보다 7커밋 뒤다. 현재 그대로 병합할 수 없다.
- Harness CI는 테스트가 아니라 `actions/setup-node@v5`에서 `pnpm` 실행 파일을 찾지 못해 종료됐다. PR #4가 루트 `package.json`에 `packageManager: pnpm`을 추가했지만 루트에는 `pnpm-lock.yaml`·pnpm 설치 단계가 없고, 실제 신규 앱은 `mobile/package-lock.json`을 쓰는 npm 프로젝트다.
- 권장 병합은 **표정 브랜치 정합→병합 후 PR #4 rebase**다. 표정 브랜치를 먼저 최신 `main`에 rebase해 얼굴 자산을 고정하고, 그 다음 PR #4를 새 `main`에 rebase해 `HANDOFF`를 현재 사실로 수동 재작성한다. `ours/theirs`로 HANDOFF 한쪽을 통째로 고르지 않는다.
- PR #4에서는 루트 `packageManager` 필드를 제거하는 것이 최소 수정이다. pnpm 전환 의도가 따로 있다면 lockfile·Corepack·workflow까지 별도 작업으로 다뤄야 하며 이 이슈에 섞지 않는다.

## 통합 해결 기록 (2026-08-22)

- 인간 지시에 따라 표정 브랜치 선병합 권고를 대체하고 `feat/connection-and-sensor`를 `origin/main@d975add`에 직접 rebase했다.
- 충돌은 [CON-03]과 HANDOFF 두 건이었다. 최신 main의 인간 합의 [CON-03] v0.2(IndexedDB 제품 기록)는 보존하고, RN SQLite 조도 버킷을 [CON-02f1] v0.1로 분리했다.
- 루트의 우발적 `packageManager=pnpm`은 제거했다. rebase 결과 `3f52d18`을 force-with-lease로 PR #4에 갱신했고 GitHub mergeable=true, push/PR Harness CI 두 건 모두 green이다.
- 연결된 NU40 정지 로그는 baseline 1892, brightness 1872~1882였다. 의도적인 가림·직접 조사 step은 이번 수집에서 발생하지 않아 동적 범위 판정은 아직 열려 있다.
