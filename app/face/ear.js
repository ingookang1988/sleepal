// face/ear.js — 귀: 소리 트랜지언트 → 시선 [WO-01b-6] (파트 H 소유)
//  lux.js 의 청각 판박이다 — 센서 원값을 수치 몇 개로 줄여 즉시 버린다.
//  파생 규범(오디오는 기기를 떠나지 않는다): 녹음·저장·전송 경로가 없고
//  프레임마다 RMS 두 개(L/R)만 남는다. 방향 = 스테레오 좌우 불균형.
//  폰 마이크가 모노면 균형이 0 → 정면 응시로 자연 강등된다(gazeTo(0)).
//  ⛔ R4 — NIGHT 에서는 tick 최상단에서 계산을 돌리지 않는다.
//  🎙 생애 정책 [ADR-121] — 이 마이크는 **수면 준비(WIND_DOWN) 세션의 것**이다.
//  모드가 WIND_DOWN 에 들어오면 켜고, 나가면 끈다([CON-02] mode:change 구독).
//  수면 트래킹(SLEEP 모드·잠듦/밤 상태)에서는 어떤 경로로 켜졌든 강제 OFF —
//  밤의 수음은 트래커([WO-02d-2]) 소유의 별도 경로이고, 귀가 마이크를 잡고
//  있으면 그 경로와 자원을 다툰다. dev 수동 토글은 모드 머신이 없는 동안
//  (mode = null) AWAKE·DROWSY 에서만 유효하다.
'use strict';
import { clamp, log, now, palBus, smooth } from '../core.js';
import { F } from './eyes.js';
import { emitExpression, gazeTo } from './expression.js';

// 계측용 상태 — HUD·계기판이 읽는다. 원음이 아니라 전부 파생 수치다.
export const snd = {
  last: null,   // 마지막 레벨 0~1
  bal: 0,       // 좌우 균형 -1(왼) ~ +1(오른)
  at: null,     // 마지막 표본 시각(초) — age 계산용
  n: 0,         // 누적 표본 수
  src: '-',     // 'mic' | 'sim'
  base: 0,      // 소음 바닥(느린 평활) — 트랜지언트 판정 기준
  fireAt: -9,   // 마지막 시선 발화(프레임 시계) — 불응기
  pend: null,   // 합성 경로 대기 표본 {v, b}
  mode: null,   // [CON-02] mode:change 마지막 값 — 모드 머신 미구현 동안 null
};
// 실기 보정 상수 — 폰이 몸통에 어느 방향으로 꽂히느냐에 따라 좌우가 뒤집힌다.
// 도면이 아니라 실물에서 정한다([WO-01b-6] 잔여).
export const EAR_SIGN = 1;
const FIRE_TH = 0.12;      // 바닥 대비 이만큼 튀어야 소리 "사건"이다
const FIRE_MIN = 0.08;     // 절대 최소 — 침묵방의 잡음 바닥이 발화하지 않게
const REFRACT = 1.2;       // 초 — 연발 방지. 말소리 한 문장에 한 번이면 충분하다
const BAL_DEAD = 0.08;     // 이보다 작은 불균형은 "방향 모름" = 정면

// ── 마이크 (dev 제스처로만 켠다 — 권한 대화상자가 뜬다) ────────
let stream = null, ctx = null, anL = null, anR = null, bufL = null, bufR = null;
export const earOn = () => !!stream;

export async function earStart() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false,
               autoGainControl: false, channelCount: { ideal: 2 } },
    });
    ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const split = ctx.createChannelSplitter(2);
    src.connect(split);
    anL = ctx.createAnalyser(); anR = ctx.createAnalyser();
    anL.fftSize = 256; anR.fftSize = 256;
    split.connect(anL, 0); split.connect(anR, 1);
    bufL = new Uint8Array(anL.fftSize); bufR = new Uint8Array(anR.fftSize);
    snd.src = 'mic';
    log('귀 ON — RMS 2개만 남기고 즉시 폐기');
  } catch (e) {
    log('귀 실패: ' + e.message);
    earStop();
  }
}
export function earStop() {
  if (stream) for (const tr of stream.getTracks()) tr.stop();
  if (ctx) ctx.close().catch(function () {});
  stream = null; ctx = null; anL = null; anR = null; bufL = null; bufR = null;
  if (snd.src === 'mic') snd.src = '-';
  log('귀 OFF');
}

// ── 생애 정책 [ADR-121] — 순수 판정 함수. 시트 게이트가 직접 검사한다 ──
//  금지 = 트래킹: SLEEP 모드이거나 팰이 잠든/밤 상태. 여기 걸리면 어떤 경로로
//  켜졌든 tick 이 즉시 끈다.
export function earBanned(mode, state) {
  return mode === 'SLEEP' || state === 'ASLEEP' || state === 'NIGHT';
}
// 모드 세션 배선 — WIND_DOWN 진입에 켜고, 이탈에 끈다. 자동 켬은 이전에
// 부여된 마이크 권한을 재사용한다(첫 부여는 사용자 제스처 필요 — dev 버튼).
palBus.addEventListener('mode:change', function (e) {
  snd.mode = e.detail ? e.detail.to : null;
  if (snd.mode === 'WIND_DOWN') { if (!stream) earStart(); }
  else if (stream) { earStop(); log('귀 OFF — 수면 준비 세션 종료'); }
});

function rms(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) { const d = (buf[i] - 128) / 128; s += d * d; }
  return Math.sqrt(s / buf.length);
}

// ── 합성 경로 — 보드·마이크 없이 시선을 보기 위한 것 ──────────
//  디버그 버튼·키·시트가 쓴다. 다음 tick 이 프레임 시계로 소비한다.
export function feedSnd(level, bal) {
  snd.pend = { v: clamp(level, 0, 1), b: clamp(bal || 0, -1, 1) };
  if (snd.src !== 'mic') snd.src = 'sim';
}

// ── 프레임 틱 — main 루프가 부른다. 시간은 전부 프레임 시계다 ──
export function tickEar(t, dt) {
  // 🎙 정책 집행 [ADR-121] — 트래킹(SLEEP·잠듦·밤)에서는 하드웨어부터 놓는다.
  //  R4 의 "계산 정지"보다 강하다: 마이크 스트림 자체를 반납해 밤의 수음을
  //  트래커([WO-02d-2]) 경로에 넘긴다.
  if (stream && earBanned(snd.mode, F.state)) {
    earStop();
    log('귀 강제 OFF — 트래킹 중 마이크 금지 [ADR-121]');
  }
  if (F.state === 'NIGHT') return;           // ⛔ R4 — 계산 자체를 돌리지 않는다
  let level = null, bal = 0;
  if (anL) {
    anL.getByteTimeDomainData(bufL);
    anR.getByteTimeDomainData(bufR);
    const rl = rms(bufL), rr = rms(bufR);
    level = Math.max(rl, rr);
    bal = (rr - rl) / Math.max(rr + rl, 1e-4);
  } else if (snd.pend) {
    level = snd.pend.v; bal = snd.pend.b;
    snd.pend = null;
  }
  if (level === null) return;
  snd.last = level; snd.bal = bal; snd.at = now(); snd.n++;

  // 소음 바닥 — 느리게 따라간다. 큰 소리가 바닥을 끌어올리지 않게
  // 상승은 더 느리다(비대칭 — glare 평활과 같은 원리, 방향은 반대).
  snd.base = smooth(snd.base, level, level > snd.base ? 8.0 : 2.0, dt);

  // 트랜지언트 → 시선. 방향을 모르면(모노) 정면 응시로 강등된다.
  if (level > snd.base + FIRE_TH && level > FIRE_MIN && t - snd.fireAt > REFRACT) {
    snd.fireAt = t;
    const dir = Math.abs(bal) < BAL_DEAD ? 0 : clamp(bal * 2.2, -1, 1) * EAR_SIGN;
    gazeTo(dir);
    emitExpression('curious', clamp(0.55 + (level - snd.base) * 1.5, 0.55, 1), 'sound');
  }
}
