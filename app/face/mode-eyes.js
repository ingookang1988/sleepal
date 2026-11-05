// face/mode-eyes.js — 모드 → 눈 상태 유도 [WO-02d-1] (파트 H 소유 · [CON-02] 규칙 4)
//  보드가 **연결돼 있지 않을 때만** 폰의 모드가 눈 상태를 정한다. 보드가 있으면
//  [CON-01] 규칙 1 그대로 보드의 STATE: 가 판정 주체이고 이 파일은 아무것도 하지 않는다 —
//  판정 주체가 둘이면 무대에서 반드시 어긋난다.
//
//  유도 표([CON-02] 규칙 4):
//    PLAY → AWAKE · WIND_DOWN → DROWSY · SLEEP → ASLEEP → (nightS 뒤) NIGHT · WAKE → MORNING
//  NIGHT 는 모드가 아니라 **잠듦이 깊어진 것**이다 — SLEEP 이 nightS(기본 10분) 지속되면
//  화면이 완전히 꺼진다(R4). SLEEP 을 떠나면 타이머는 취소된다.
'use strict';
import { log, palBus, qs } from '../core.js';
import { F, setEyeState } from './eyes.js';
import { bleStatus } from '../ble.js';

export const EYE_FOR_MODE = Object.freeze({ PLAY: 'AWAKE', WIND_DOWN: 'DROWSY', SLEEP: 'ASLEEP', WAKE: 'MORNING' });
const nightQ = parseFloat(qs.get('nightS'));
export const NIGHT_AFTER_S = (!Number.isNaN(nightQ) && nightQ >= 0) ? nightQ : 600;

export function eyeForMode(mode) { return EYE_FOR_MODE[mode] || null; }

let nightTimer = null;
function cancelNight() { if (nightTimer) { clearTimeout(nightTimer); nightTimer = null; } }
function night() {
  nightTimer = null;
  if (F.state === 'ASLEEP' && !bleStatus().connected) setEyeState('NIGHT');
}

palBus.addEventListener('mode:change', function (e) {
  const to = e.detail ? e.detail.to : null;
  cancelNight();
  if (bleStatus().connected) return;           // [CON-01] 규칙 1 — 보드가 판정한다
  const st = eyeForMode(to);
  if (!st) return;
  setEyeState(st);
  if (to === 'SLEEP') nightTimer = setTimeout(night, NIGHT_AFTER_S * 1000);
});

// 검사용 — nightS 를 기다리지 않고 "잠듦이 깊어짐"을 지금 적용한다.
export function _nightNow() { cancelNight(); night(); }
