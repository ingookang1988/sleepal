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
> consumers: [WO-02b-2] · [WO-02c-1] · [WO-02d-2] · face/expression.js · face/fx.js(expr:trigger note) · face/ear.js(mode:change — 마이크 생애 [ADR-121]: WIND_DOWN 진입 시 켬·이탈 시 끔) — 계보(02) 밖 소비자가 생기면 선언 갱신.

## 전송 계층
브라우저 내부 `EventTarget` 하나(`palBus`). BLE 아님 — 보드는 이 계약을 모른다([CON-01] 규칙 2 불변: 표정·모드는 상태 전이를 유발하지 않는다... 단 모드는 **폰 소유 층**이므로 보드 `STATE:`와 독립).

## 이벤트 (v0.1 — 이름·페이로드는 착수 전 양 파트 합의로 확정)
| 이벤트 | 페이로드 | 발행자 | 의미 |
|---|---|---|---|
| `mode:change` | `{from, to, cause}` | mode.js | 4모드 전이. `cause`: `"lux+quiet5m" \| "command" \| "lux+noise5m"` |
| `mode:progress` | `{to, elapsed, need}` | mode.js | 히스테리시스 진행(dev HUD 표시용, 프로덕션 UI 금지 — R6) |
| `expr:trigger` | `{kind, tone}` | babble.js 등 | 표정 트리거(발화 동기 등). 연속 변조가 아니라 이산 사건만 |

### `expr:trigger` 어휘 — v0.2 ([WO-01b-7] 수신부 구현 시점, 발행자 미존재 상태의 잠정 합의)
- `kind`: `"happy" | "curious" | "sad"`(표정 — serve.js `PAL_SYSTEM` emotion enum 재사용, 새 어휘 금지) · `"note"`(음표 fx 1발 — 표정이 아니라 도상, `face/fx.js` 가 소비)
- `tone`: `0~1` 수치 또는 babbleTone 문자열 `"soft"(0.6) | "bright"(1) | "drowsy"(0.35)` — 수신부가 깊이로 환산
- 소비 구현: `face/expression.js`(happy·curious·sad) · `face/fx.js`(note). 발행자([WO-02b-2] babble.js · [WO-02c-1] sound.js) 착수 시 이 표를 기준으로 합의 확정(규칙 3).

## 규칙
1. 모드는 `mode.js` 만 발행한다 — 소비자가 모드를 되쓰면 결함.
2. NIGHT/SLEEP 에서 소비자는 각자 R4 를 집행한다(발행자만 믿지 않는다 — 이중 방어).
3. 계약 변경은 소비자 전원 합의 + 이 문서 버전 증가.
