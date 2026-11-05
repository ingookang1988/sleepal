// face/emotion-core.mjs — 이산 표정의 순수 핵 [WO-01b-7] (파트 H 소유)
//  봉투 정의 · 진행 · **다중 슬롯 합성**. DOM·시간 의존 0 — scripts/emotion-core.test.js 가 node 에서 연속성을 검사한다.
//
//  왜 슬롯이 여럿인가([ANL-01b] 근인 1): 슬롯이 하나면 새 트리거가 이전 봉투를 한 프레임에 0 으로 떨어뜨린다
//  (아래꺼풀 0.62→0, 약 17mm). 놀이에서 반응이 연달아 오면 얼굴이 튄다. 그래서 새 트리거는 이전 슬롯을
//  짧은 페이드(FADE_T)로 **내리면서** 자기 어택을 탄다 — 채널은 합이고, 전부 끝나면 0 으로 원복한다.

export const EMO_DEF = Object.freeze({
  happy:    { dur: 1.9, atk: 0.28, rel: 0.70 },   // 아래꺼풀 ⌣ + 입꼬리
  curious:  { dur: 1.6, atk: 0.18, rel: 0.50 },   // 한쪽 눈 확대 + 고개 갸웃 + 입 'o'
  sad:      { dur: 2.6, atk: 0.45, rel: 1.00 },   // 눈꼬리 바깥 처짐 + 윗꺼풀 처짐 + 입꼬리 내림
  startled: { dur: 0.9, atk: 0.06, rel: 0.36 },   // 빛 급상승 — 짧은 수축 + 'o' (+ 하드 블링크, kind 기준)
  relieved: { dur: 1.8, atk: 0.24, rel: 0.75 },   // 빛 급하강 — 아래꺼풀 + 입꼬리
  thinking: { dur: 2.2, atk: 0.30, rel: 0.70 },   // 시선 위 + 한쪽 눈 가늘게 + 살짝 갸웃 (v0.2)
  yawn:     { dur: 2.0, atk: 0.70, rel: 0.80 },   // 입 하품 + 눈 찡그림 (v0.2) — 입 봉투와 같은 리듬
});
export const FADE_T = 0.18;   // 이전 봉투를 내리는 시간(초) — 새 어택(0.06~0.45)과 겹쳐 연속으로 읽힌다

// 봉투 — 오르고(atk) · 머물고 · 풀린다(rel). 음수 = 끝.
export function emoAmt(d, t) {
  if (t < d.atk) return t / d.atk;
  if (t < d.dur - d.rel) return 1;
  if (t < d.dur) return 1 - (t - (d.dur - d.rel)) / d.rel;
  return -1;
}

// kind 별 채널 델타(진폭 a 에서). 전부 0 이면 기하는 기본값과 픽셀 단위로 같다.
//  low: 아래꺼풀 0~1 · hL/hR: 높이 배율 델타(1 기준) · tilt: 감정 기울기(°, 음수 = 바깥 처짐)
//  curve: 입꼬리 가감 · open: 입 벌림 · lid: 윗꺼풀 처짐 0~1 · head: 두 눈 공통 기울기(°, 고개 갸웃)
export function channels(kind, a) {
  switch (kind) {
    case 'happy':    return { low: 0.62 * a, hL: 0, hR: 0, tilt: 0, curve: 1.8 * a, open: 0, lid: 0, head: 0 };
    case 'curious':  return { low: 0, hL: 0.06 * a, hR: -0.08 * a, tilt: 0, curve: 0, open: 0.22 * a, lid: 0, head: 2.5 * a };
    case 'sad':      return { low: 0.12 * a, hL: 0, hR: 0, tilt: -5 * a, curve: -2.6 * a, open: 0, lid: 0.15 * a, head: 0 };
    case 'startled': return { low: 0, hL: -0.14 * a, hR: -0.14 * a, tilt: 2.5 * a, curve: 0, open: 0.72 * a, lid: 0, head: 0 };
    case 'relieved': return { low: 0.34 * a, hL: 0.02 * a, hR: 0.02 * a, tilt: 0, curve: 1.35 * a, open: 0, lid: 0, head: 0 };
    case 'thinking': return { low: 0, hL: 0, hR: -0.12 * a, tilt: 0, curve: 0.4 * a, open: 0, lid: 0, head: 1.5 * a };
    case 'yawn':     return { low: 0, hL: -0.10 * a, hR: -0.10 * a, tilt: 0, curve: 0, open: 1.0 * a, lid: 0.30 * a, head: 0 };
    default:         return ZERO();
  }
}
export const ZERO = () => ({ low: 0, hL: 0, hR: 0, tilt: 0, curve: 0, open: 0, lid: 0, head: 0 });

/** 새 슬롯을 연다 — 살아 있는 슬롯은 전부 페이드로 보낸다(이미 페이드 중이면 그대로). 순수: 새 배열을 돌려준다. */
export function trigger(slots, kind, tone, source) {
  if (!EMO_DEF[kind]) return slots;
  const out = slots.map((s) => (s.fade < 0 ? Object.assign({}, s, { fade: 0 }) : s));
  out.push({ kind, t: 0, tone: tone === undefined ? 1 : tone, source: source || 'system', fade: -1 });
  return out;
}

/** 한 프레임 진행 — 끝난 슬롯 제거. 순수. */
export function advance(slots, dt) {
  const out = [];
  for (const s of slots) {
    const n = Object.assign({}, s, { t: s.t + dt, fade: s.fade < 0 ? -1 : s.fade + dt });
    if (emoAmt(EMO_DEF[n.kind], n.t) < 0) continue;      // 봉투 끝
    if (n.fade >= FADE_T) continue;                        // 페이드 끝
    out.push(n);
  }
  return out;
}

/** 합성 — gate(상태별 0~1) 를 곱한 채널 합. 가장 최근 슬롯이 HUD 용 kind/amt 가 된다. 순수. */
export function mix(slots, gate) {
  const sum = ZERO();
  let kind = null, amt = 0, source = null;
  for (const s of slots) {
    const a0 = emoAmt(EMO_DEF[s.kind], s.t);
    if (a0 < 0) continue;
    const fadeK = s.fade < 0 ? 1 : Math.max(0, 1 - s.fade / FADE_T);
    const a = a0 * fadeK * gate * (0.55 + 0.45 * s.tone);
    const c = channels(s.kind, a);
    for (const k of Object.keys(sum)) sum[k] += c[k];
    if (s.fade < 0) { kind = s.kind; amt = a; source = s.source; }
  }
  sum.low = Math.min(1, sum.low); sum.lid = Math.min(1, sum.lid);
  return { ch: sum, kind, amt, source };
}
