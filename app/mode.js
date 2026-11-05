// mode.js — 모드 상태 머신 배선 [WO-02d-1] (파트 T 소유)
//  순수 핵은 mode-core.mjs. 여기는 센서를 핵에 먹이고 [CON-02] 이벤트를 palBus 에
//  발행하는 것뿐이다. 모드는 이 파일만 발행한다([CON-02] 규칙 1).
//
//  센서 — 둘 다 **기존 경로를 재사용**한다(새 센서 채널을 만들면 결함):
//   · 조도 = lux.js 의 lux.last. 보드가 연결돼 있으면 보드 LUX: 가, 아니면 카메라
//     조도계(camStart)가 채운다. 5초 넘게 표본이 없으면 null — 모르는 것은 모른다.
//   · 소리 = 귀(face/ear.js)가 켜져 있으면 그 RMS(snd.last)를 읽는다. 귀는 WIND_DOWN
//     세션의 것이라([ADR-121]) SLEEP 에서는 꺼진다 — 그동안은 이 파일의 **T 수음**이
//     모노 RMS 하나만 남기고 즉시 버린다(원음 무저장·무전송). 밤의 수음은 트래커
//     ([WO-02d-2]) 소유 경로이고 이것은 그 전신이다 — 트래커 착수 시 그쪽으로 옮긴다.
//     귀와 동시에 getUserMedia 를 열지 않는다(공존 미검증 — [WO-01b-6] 잔여).
//
//  실행은 rAF 가 아니라 200ms 타이머다 — 화면 갱신과 독립이어야 밤(NIGHT)에도 센다.
//  ⛔ R4: 이 파일은 화면·소리·알림을 만들지 않는다. 밤의 출력은 0 이다.
'use strict';
import { clamp, log, now, palBus, qs } from './core.js';
import { camOn, camStart, lux } from './lux.js';
import { earOn, snd } from './face/ear.js';
import { bleStatus } from './ble.js';
import { COMMANDS, createModeMachine, DEFAULTS, MODES } from './mode-core.mjs';

// ── 계측용 상태 — HUD·계기판이 읽는다 ─────────────────────────
export const MODE = {
  mode: 'PLAY', since: 0, cause: 'start',
  progress: null,          // {to, elapsed, need} | null
  lux: null, snd: null,    // 마지막으로 핵에 먹인 값
  sndSrc: '-',             // 'ear' | 'listen' | '-'
  ticks: 0, at: null,
};
export { MODES, DEFAULTS };

// 상수 덮어쓰기 — 실기 튜닝은 URL 로(?dark=40&bright=200&quiet=0.05&noise=0.12&windDownS=60&sleepS=300&wakeS=300)
function readParams() {
  const map = { dark: 'darkLux', bright: 'brightLux', quiet: 'quietLevel', noise: 'noiseLevel',
                windDownS: 'windDownS', sleepS: 'sleepS', wakeS: 'wakeS' };
  const p = {};
  for (const k of Object.keys(map)) {
    const v = parseFloat(qs.get(k));
    if (!Number.isNaN(v) && v >= 0) p[map[k]] = v;
  }
  return p;
}
const machine = createModeMachine({ params: readParams(), t0: now() });
export const modeParams = machine.params;

// ── T 수음 — 모노 RMS 하나 ───────────────────────────────────
const listen = { stream: null, ctx: null, an: null, buf: null, timer: null, level: null };
export const listening = () => !!listen.stream;
async function listenStart() {
  if (listen.stream) return;
  try {
    listen.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 1 } },
    });
    listen.ctx = new AudioContext();
    listen.an = listen.ctx.createAnalyser(); listen.an.fftSize = 256;
    listen.ctx.createMediaStreamSource(listen.stream).connect(listen.an);
    listen.buf = new Uint8Array(listen.an.fftSize);
    listen.timer = setInterval(listenSample, 200);
    log('수음 ON — RMS 1개만 남기고 즉시 폐기 (T)');
  } catch (e) {
    log('수음 실패: ' + e.message + ' — 조도 단독으로 판정');
    listenStop();
  }
}
function listenStop() {
  clearInterval(listen.timer); listen.timer = null;
  if (listen.stream) for (const tr of listen.stream.getTracks()) tr.stop();
  if (listen.ctx) listen.ctx.close().catch(function () {});
  listen.stream = null; listen.ctx = null; listen.an = null; listen.buf = null; listen.level = null;
}
function listenSample() {
  if (!listen.an) return;
  listen.an.getByteTimeDomainData(listen.buf);
  let s = 0;
  for (let i = 0; i < listen.buf.length; i++) { const d = (listen.buf[i] - 128) / 128; s += d * d; }
  listen.level = Math.sqrt(s / listen.buf.length);
}

// 권한 프라이밍 — 시작 버튼(사용자 제스처)에서 한 번 묻고 즉시 반납한다. 이후의
// 자동 켬(귀·수음)은 부여된 권한을 재사용한다. 거부되면 조도 단독으로 간다.
let micPrimed = false;
async function primeMic() {
  if (micPrimed || !navigator.mediaDevices) return;
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const tr of s.getTracks()) tr.stop();
    micPrimed = true;
    log('마이크 권한 확보');
  } catch (e) { log('마이크 권한 없음: ' + e.message + ' — 조도 단독으로 판정'); }
}

// ── 발행 ───────────────────────────────────────────────────────
let bus = palBus, progressAt = 0;
function publish(events, t) {
  for (const ev of events) {
    if (ev.type === 'mode:change') {
      MODE.mode = ev.to; MODE.since = ev.t; MODE.cause = ev.cause; MODE.progress = null;
      log('mode ' + ev.from + ' → ' + ev.to + ' (' + ev.cause + ')');
      bus.dispatchEvent(new CustomEvent('mode:change', { detail: { from: ev.from, to: ev.to, cause: ev.cause } }));
      // 수음 생애: SLEEP 에서만(귀가 금지되는 구간). 그 밖에서는 귀가 있거나 필요 없다.
      if (ev.to === 'SLEEP') listenStart(); else listenStop();
    } else if (ev.type === 'mode:progress') {
      MODE.progress = ev.to ? { to: ev.to, elapsed: ev.elapsed, need: ev.need } : null;
      if (t - progressAt >= 1.0 || !ev.to) {          // 버스는 1Hz 로만 — dev HUD 용이다
        progressAt = t;
        bus.dispatchEvent(new CustomEvent('mode:progress', { detail: { to: ev.to, elapsed: ev.elapsed, need: ev.need } }));
      }
    }
  }
}

// ── 틱 — 200ms 타이머. 센서 → 핵 → 버스 ─────────────────────
function sample(t) {
  const fresh = lux.at !== null && t - lux.at < 5;
  const lv = fresh ? lux.last : null;
  let sl = null, src = '-';
  if (earOn() && snd.last !== null) { sl = snd.last; src = 'ear'; }
  else if (listen.level !== null) { sl = listen.level; src = 'listen'; }
  return { lv, sl, src };
}
function tick() {
  const t = now();
  const s = sample(t);
  feed(t, s.lv, s.sl, s.src);
}
function feed(t, lv, sl, src) {
  MODE.lux = lv; MODE.snd = sl; MODE.sndSrc = src || '-'; MODE.ticks++; MODE.at = t;
  publish(machine.feed({ t, lux: lv, snd: sl }), t);
}

let timer = null;
export function initMode(b) {
  if (b) bus = b;
  if (!timer) timer = setInterval(tick, 200);
}

// 시작 버튼 → 세션 시작. 사용자 제스처 안에서 권한을 묻는다.
export async function modeStart() {
  // 조도계 — 보드가 연결돼 있으면 보드 LUX: 가 lux 를 채우므로 카메라를 켜지 않는다.
  if (!bleStatus().connected && !camOn()) await camStart();
  await primeMic();
  modeCommand('play');
}
export function modeCommand(cmd) {
  if (!COMMANDS[cmd]) return false;
  const t = now();
  publish(machine.command(cmd, t), t);
  return true;
}

// 검사용 — 타이머를 거치지 않고 가상 시계로 핵에 먹인다(헤드리스 게이트).
export function _modeFeed(t, lv, sl) { feed(t, lv == null ? null : lv, sl == null ? null : sl, 'test'); }
export const _machine = machine;
