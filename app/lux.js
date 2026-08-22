// lux.js — 조도 체인 + 카메라 조도계 (파트 H 소유)
//   [CON-01] 규칙 2: 표정 변조는 허용, 상태 전이 유발은 금지.
//   기준선은 폰이 자체 보유한다([ADR-103]).
'use strict';
import { $, clamp, log, now } from './core.js';
import { F } from './face/eyes.js';
import { GL, RELEASE_T } from './face/expression.js';

export const lux = { base: null, med: null, recent: [], last: null,
              count: 0, at: null, mean: null, src: '—', baseUsed: null,
              // dev 전용 — 기준선을 이 값에 묶는다. null = 평소대로 롤링 중앙값.
              // 카메라 조도계는 자동 노출이 평균 휘도를 붙들어서 중앙값이 신호를
              // 그대로 따라온다 → base ≈ v → glare 가 영원히 0 이다. 고정해야
              // 체인이 눈에 보인다. 보드 경로에는 쓰지 않는다([ADR-103] 유지).
              hold: null };

export function feedLux(v) {
  const t = now(), prev = lux.last;
  lux.last = v;
  lux.count++;          // 표본이 실제로 들어오고 있는지의 유일한 증거
  lux.at = t;
  lux.recent.push({ t: t, v: v });
  while (lux.recent.length && lux.recent[0].t < t - 30) lux.recent.shift();

  // 폰이 기준선을 자체 보유한다([ADR-103]) — 30초 롤링 중앙값.
  // LUX:BASE 는 표본이 모이기 전의 씨앗으로만 쓴다. 보드가 기준선을
  // 재보정해도 표정이 소리 없이 풀리지 않는다.
  const vs = lux.recent.map(function (s) { return s.v; }).sort(function (a, b) { return a - b; });
  lux.med = vs.length ? vs[vs.length >> 1] : null;
  const base = lux.hold !== null ? lux.hold
             : (lux.recent.length >= 10) ? lux.med
             : (lux.base !== null ? lux.base : lux.med);
  lux.baseUsed = base;                // HUD·계기판이 읽는다 — base 가 보여야 raw 0 이 설명된다
  if (base !== null) GL.raw = clamp(Math.log((v + 1) / (base + 1)) / Math.log(16), 0, 1);

  // 트랜지언트 — 상승은 한 샘플, 하강은 **1초 창**으로 본다.
  //  하강을 한 샘플 비교로 잡으면 카메라에서 안도가 영영 안 뜬다 — AE 가
  //  복귀를 ~1초(5표본)에 뭉개서 표본당 낙폭이 항상 문턱 아래로 내려간다.
  //  상승은 그대로 둔다: 스파이크는 AE 가 물기 *전*이라 한 샘플에 온전히 실린다.
  //  가드 둘([ADR-117]):
  //   · 저조도 가드 — 두 값 모두 16 lux 미만이면 무시. 어두운 카메라의 양자화
  //     잡음은 log 스케일에서 수 stop 짜리 유령 급변을 만든다(실측 30초에 16발).
  //   · 불응기 2초 — 같은 하강이 창을 지나는 동안 안도가 연발하지 않는다.
  if (prev !== null) {
    const stops = Math.log((v + 1) / (prev + 1)) / Math.LN2;
    // 1초 전 표본(창 안에서 가장 오래된 0.95초 이상 지난 것)
    let ref = prev;
    for (let i = lux.recent.length - 1; i >= 0; i--)
      if (t - lux.recent[i].t >= 0.95) { ref = lux.recent[i].v; break; }
    const wStops = Math.log((v + 1) / (ref + 1)) / Math.LN2;
    if (stops >= 2 && Math.max(v, prev) >= 16 && t - GL.flinchAt >= 2.0) {
      GL.flinch = 0; GL.flinchAt = t;      // 움찔 — 하드 블링크 0.09초
      F.blinkEnv = [0.045, 0, 0.045]; F.blinkT = 0;
      log('움찔 (+' + stops.toFixed(1) + ' stop)');
    } else if (wStops <= -2 && Math.max(v, ref) >= 16 && t - GL.reliefAt >= 2.0) {
      // 안도. 깜빡임과 같은 길이로 *놓아주는* 창을 연다 — 눈꺼풀이 다시 열릴 때
      // 찡그림도 함께 풀려야 "빛이 져서 다시 떴다"로 읽힌다.
      GL.relief = 0; GL.release = RELEASE_T; GL.reliefAt = t;
      F.blinkEnv = [0.45, 0.15, 0.75]; F.blinkT = 0;
      log('안도 (' + wStops.toFixed(1) + ' stop/1s)');
    }
  }
  // ⚠ 여기서 setEyeState 를 부르지 않는다 — [CON-01] 규칙 2.
}

// ② 불 켜기/끄기 — 체인 전체(기준선·움찔·안도)를 태운다
export function simStep(from, to) {
  lux.src = 'sim';
  if (lux.recent.length < 10) for (let i = 0; i < 12; i++) feedLux(from);
  feedLux(to);
}

// ③ 카메라 조도계 — [ARCH-01] R7 이 명시적으로 허용하는 유일한 카메라 용도.
//    ⚠ 최종 시연에서는 쓸 수 없다. 폰이 몸통 *안*에 들어가면 카메라는
//      방이 아니라 골판지 안쪽을 본다. 손에 들고 반응을 볼 때만이다.
//    ⚠ 자동 노출 때문에 *절대 조도는 못 잰다.* AE 가 잡히기까지 0.5~1초의
//      스파이크는 진짜라 움찔·안도는 제대로 보이지만, 정상상태 찡그림
//      깊이는 믿으면 안 된다. 그건 슬라이더로 볼 것.
let camStream = null, camTimer = null;
export const camOn = () => !!camStream;

export async function camStart() {
  try {
    camStream = await navigator.mediaDevices.getUserMedia(
      { video: { facingMode: 'environment', width: 160, height: 120 } });
    const track = camStream.getVideoTracks()[0];
    // 가능하면 노출을 고정한다 — 되는 기기가 많지는 않다
    try {
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      if (caps.exposureMode && caps.exposureMode.indexOf('manual') >= 0) {
        await track.applyConstraints({ advanced: [{ exposureMode: 'manual' }] });
        log('노출 고정됨 — 절대 조도 신뢰 가능');
      } else log('노출 고정 불가 — 트랜지언트만 신뢰할 것');
    } catch (e) { log('노출 고정 실패: ' + e.message); }

    $('camV').srcObject = camStream;
    await $('camV').play();
    camTimer = setInterval(camSample, 200);      // [CON-01] 과 같은 5Hz
    $('dbgCam').textContent = '카메라 끄기';
    log('카메라 조도계 ON (R7 — 조도계 용도만)');
  } catch (e) {
    log('카메라 실패: ' + e.message);
    camStream = null;
  }
}
export function camStop() {
  clearInterval(camTimer); camTimer = null;
  if (camStream) camStream.getTracks().forEach(function (t) { t.stop(); });
  camStream = null;
  $('camV').srcObject = null;
  $('dbgCam').textContent = '카메라 조도계';
  log('카메라 조도계 OFF');
}
function camSample() {
  const v = $('camV'), c = $('camC');
  if (!v.videoWidth) return;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(v, 0, 0, c.width, c.height);
  const px = g.getImageData(0, 0, c.width, c.height).data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4)        // Rec.709 휘도
    sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
  const mean = sum / (px.length / 4);
  lux.mean = mean; lux.src = 'camera';
  // sRGB 감마 디코드 → 선형 광량. 어림값이지만 물리적 근거는 있다.
  feedLux(Math.round(Math.pow(mean / 255, 2.2) * 5000));
  // 프레임은 여기서 버려진다. 저장·전송하지 않는다.
}
