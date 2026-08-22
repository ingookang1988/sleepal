// ble.js — BLE 배관 (파트 H 소유)
//  Nordic UART Service. 연결·notify·라인버퍼는 원본
//  ref/toython-sleeppal/toython-sleeppal/code/web-client-index.html 의
//  것을 그대로 옮겼다 — 새로 만들지 않는다([PLAN-01b]).
//  새로 붙은 것은 [CON-01] 규칙 3(정상 종료)과 규칙 4(무시)뿐이다.
'use strict';
import { $, log, qs } from './core.js';
import { F, setEyeState } from './face/eyes.js';
import { lux, feedLux } from './lux.js';

export const NUS = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
export const RX  = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // 폰 → 보드 (write)
export const TX  = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // 보드 → 폰 (notify)

// ⚠ [CON-01] — 광고 이름은 팀 고유값이어야 한다. 실물 펌웨어(NU40_Pillow_Node)가
//   "SLEEPPAL-PILLOW-01" 로 광고하고 RN 클라이언트 기본 접두사도 SLEEPPAL 이다
//   (feat/connection-and-sensor) — 기본값을 거기에 맞춘다. 해커톤 스캐폴드의
//   TOYTHON 보드는 ?dev=TOYTHON 으로, 전체 목록은 ?dev=* 로 본다.
export const DEVICE_PREFIX = qs.get('dev') || 'SLEEPPAL';

const enc = new TextEncoder();
const dec = new TextDecoder();
let device = null, rxChar = null, rxLineBuf = '';
let normalEnd = false;      // SLEEPING 을 받고 끊긴 것인가 (규칙 3)
let retries = 0;

// hud 계기판이 읽는다 — 상태를 흩뿌리지 않고 한 함수로 내보낸다
export const bleStatus = () => ({
  connected: !!rxChar, name: device && device.name ? device.name : '', normalEnd, retries,
});

function setDot(cls) { $('dot').className = 'dot' + (cls ? ' ' + cls : ''); }

export async function connect() {
  if (!navigator.bluetooth) {
    log('이 브라우저는 Web Bluetooth 미지원 — 안드로이드 크롬으로 여세요');
    $('entryNote').textContent = 'Web Bluetooth 미지원 브라우저입니다. 얼굴은 그대로 동작합니다.';
    setDot('err');
    return;
  }
  try {
    log('보드를 찾는 중…');
    device = await navigator.bluetooth.requestDevice(
      DEVICE_PREFIX === '*'
        ? { acceptAllDevices: true, optionalServices: [NUS] }
        : { filters: [{ namePrefix: DEVICE_PREFIX }], optionalServices: [NUS] }
    );
    device.addEventListener('gattserverdisconnected', onDisconnect);
    await openGatt();
  } catch (e) {
    log('연결 실패: ' + e.message);
    setDot('err');
    $('entryNote').textContent = '연결 실패 — ' + e.message;
  }
}

async function openGatt() {
  const server  = await device.gatt.connect();
  const service = await server.getPrimaryService(NUS);
  rxChar        = await service.getCharacteristic(RX);
  const txChar  = await service.getCharacteristic(TX);
  await txChar.startNotifications();
  txChar.addEventListener('characteristicvaluechanged', onNotify);
  rxLineBuf = ''; normalEnd = false; retries = 0;
  setDot('on');
  $('entryNote').textContent = '연결됨 — ' + (device.name || '?');
  log('연결됨: ' + (device.name || '?'));
}

// 디버그 화면의 재연결 — 이미 고른 기기가 있으면 선택창 없이 다시 붙는다
// (아침 전이도 이 경로다). 없으면 처음처럼 고른다.
export function reconnect() {
  if (device) { normalEnd = false; retries = 0; return openGatt(); }
  return connect();
}

export function onNotify(ev) {
  rxLineBuf += dec.decode(ev.target.value);
  let i;
  while ((i = rxLineBuf.search(/[\r\n]/)) >= 0) {
    const line = rxLineBuf.slice(0, i).trim();
    rxLineBuf = rxLineBuf.slice(i + 1);
    if (line) handleLine(line);
  }
}

// [CON-01] 규칙 3 — SLEEPING 이후의 끊김은 오류가 아니라 정상 종료다.
// 여기서 재연결을 시도하면 팰을 깨우는 그림이 된다.
export function onDisconnect() {
  rxChar = null;
  setDot(normalEnd ? '' : 'err');
  if (normalEnd) { log('정상 종료 — System OFF (재연결하지 않는다)'); return; }
  log('연결이 끊어졌습니다');
  if (retries < 3 && device) {                 // 예기치 못한 끊김만 재시도
    retries++;
    const wait = retries * 1200;
    log('재연결 시도 ' + retries + '/3 (' + wait + 'ms 뒤)');
    setTimeout(() => { if (!rxChar && device) openGatt().catch(e => log('재연결 실패: ' + e.message)); }, wait);
  }
}

export async function send(str) {
  if (!rxChar) { log('→ ' + str + ' (미연결, 무시)'); return; }
  try { await rxChar.writeValue(enc.encode(str + '\n')); log('→ ' + str); }
  catch (e) { log('전송 실패: ' + e.message); }
}

// ── [CON-01] v0.2 — 수신 라인 해석 ─────────────────────────────
export function handleLine(line) {
  log('<- ' + line);
  let m;
  if ((m = line.match(/^STATE:(AWAKE|DROWSY|ASLEEP)$/))) { setEyeState(m[1]); return; }
  // 유도: 밤. 이 뒤의 끊김은 정상 종료다(규칙 3) — 재연결 억제 플래그를 세운다.
  if (line === 'SLEEPING') { normalEnd = true; setEyeState('NIGHT'); return; }
  if (line === 'HELLO' && F.state === 'NIGHT') { setEyeState('MORNING'); return; }
  if ((m = line.match(/^LUX:BASE:(\d+)$/))) { lux.base = +m[1]; return; }
  if ((m = line.match(/^LUX:(\d+)$/)))      { lux.src = 'board'; feedLux(+m[1]); return; }
  // 규칙 5 — 알 수 없는 메시지는 무시한다.
}

// 검사용 — 배관을 태우지 않고 라인 스트림만 흉내낸다
export function _feedRaw(s) { onNotify({ target: { value: enc.encode(s) } }); }
export function _reset() { normalEnd = false; retries = 0; rxLineBuf = ''; }
