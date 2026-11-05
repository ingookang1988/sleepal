<!-- [Schema/계약·상태] 폰 내부 모드 이벤트 계약. T(발행) ↔ H(소비)가 여기서 만난다 — 각자 정의하면 어긋난다. -->
---
id: CON-02
title: 런타임 모드 이벤트 계약 (모드 머신 → 표정·사운드·트래커)
status: Draft
tier: draft
version: 0.2
---

# [CON-02] 런타임 모드 이벤트

> **존재 이유 — 파트 경계.** [WO-02d-1](T·발행)과 표정([WO-02b-2] H)·사운드([WO-02c-1] T)·트래커([WO-02d-2] T)가 소비한다. [CON-01] `STATE:` 문법의 **폰 내부 미러** — 눈은 상태를 말하고, 모드는 이벤트로 말한다. 새 채널을 만들면 결함이다.
> consumers: [WO-02b-2] · [WO-02c-1] · [WO-02d-2] · face/expression.js · face/ear.js([ADR-121]) · **face/mode-eyes.js**(규칙 4, v0.2) — 계보(02) 밖 소비자가 생기면 선언 갱신.
>
> **v0.2 (2026-11-05, [WO-02d-1] 착수)** — 발행자 `mode.js` 실재. cause 어휘에 `lux1m`·`start` 추가, 규칙 4(보드 미연결 시 모드 → 눈 상태 유도)·규칙 5(센서 부재의 뜻·T 수음) 추가. 근거: HISTORY 2026-11-05(보드 선택화).

## 전송 계층
브라우저 내부 `EventTarget` 하나(`palBus`). BLE 아님 — 보드는 이 계약을 모른다([CON-01] 규칙 2 불변: 표정·모드는 상태 전이를 유발하지 않는다... 단 모드는 **폰 소유 층**이므로 보드 `STATE:`와 독립).

## 이벤트 (v0.1 — 이름·페이로드는 착수 전 양 파트 합의로 확정)
| 이벤트 | 페이로드 | 발행자 | 의미 |
|---|---|---|---|
| `mode:change` | `{from, to, cause}` | mode.js | 4모드 전이. `cause`: `"lux1m"`(PLAY⇄WIND_DOWN 조도 1분) \| `"lux+quiet5m"`(→SLEEP) \| `"lux+noise5m"`(→WAKE) \| `"command"`(명령·버튼·키) \| `"start"`(부팅 초기값) |
| `mode:progress` | `{to, elapsed, need}` | mode.js | 히스테리시스 진행(dev HUD 표시용, 프로덕션 UI 금지 — R6). 버스에는 1Hz, `to:null` 은 후보 리셋 |
| `expr:trigger` | `{kind, tone}` | babble.js 등 | 표정 트리거(발화 동기 등). 연속 변조가 아니라 이산 사건만 |

## 규칙
1. 모드는 `mode.js` 만 발행한다 — 소비자가 모드를 되쓰면 결함.
2. NIGHT/SLEEP 에서 소비자는 각자 R4 를 집행한다(발행자만 믿지 않는다 — 이중 방어).
3. 계약 변경은 소비자 전원 합의 + 이 문서 버전 증가.
4. **보드 미연결 시 모드가 눈 상태를 유도한다**(`face/mode-eyes.js`, H 소유 소비자 — 발행자는 눈을 직접 만지지 않는다). 보드가 연결돼 있으면 이 규칙은 **비활성**이고 [CON-01] 규칙 1 이 그대로다(판정 주체는 항상 하나). 유도표:

   | 모드 | 눈 상태 | 비고 |
   |---|---|---|
   | `PLAY` | `AWAKE` | |
   | `WIND_DOWN` | `DROWSY` | |
   | `SLEEP` | `ASLEEP` → `NIGHT` | SLEEP 이 `nightS`(기본 600초) 지속되면 NIGHT — "잠듦이 깊어졌다". SLEEP 을 떠나면 타이머 취소 |
   | `WAKE` | `MORNING` | WAKE → PLAY 는 명령(시작 버튼)으로만 — 저절로 놀이로 돌아가지 않는다 |

   `NIGHT` 는 모드가 아니라 눈의 깊이다. 밤에는 [ARCH-01] R4 가 소비자마다 집행되고(규칙 2) 모드 머신은 화면·소리·알림을 만들지 않는다 — 다만 **센서는 계속 센다**(밝아지고 소리가 나면 WAKE 로 가야 하므로).
5. **센서 부재의 뜻과 수음 소유.** 조도가 5초 넘게 없으면 `lux = null` 이고 **어떤 전이도 없다**(모르는 것을 어둡다고 추측하지 않는다). 소리가 없으면(`snd = null`) 소리 조건은 **충족으로 간주**한다 — 마이크 권한이 거부돼도 조도만으로 루프가 성립한다(R8). 소리 원천의 우선순위: 귀(`face/ear.js`, WIND_DOWN 세션 — [ADR-121])가 켜져 있으면 그 RMS, 아니면 `mode.js` 의 **T 수음**(SLEEP 에서만 켜지는 모노 RMS 1개 — 트래커 [WO-02d-2] 경로의 전신, 원음 무저장·무전송). 둘이 동시에 `getUserMedia` 를 열지 않는다. 상수(`darkLux`·`brightLux`·`quietLevel`·`noiseLevel`·`windDownS`·`sleepS`·`wakeS`·`nightS`)는 실측 튜닝 대상이며 URL 질의로 덮어쓴다.
