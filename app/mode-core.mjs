// mode-core.mjs — 모드 상태 머신의 순수 핵 [WO-02d-1] (파트 T 소유)
//  DOM·센서·타이머 의존 0 — 시간은 전부 인자(t, 초)로 받는다. 그래서 node 가 5분을
//  기다리지 않고 전이 시나리오를 검사한다(scripts/mode-core.test.js). 배선은 mode.js.
//
//  4모드([PLAN-02] §합의): PLAY → WIND_DOWN → SLEEP → WAKE (→ PLAY 는 명령으로만)
//  전이는 **환경이 지속**될 때만 일어난다(히스테리시스 — 조건이 한 번이라도 깨지면
//  타이머 리셋). 문턱 근처에서 떨리지 않게 하는 것이 눈 상태 머신과 같은 원리다.
//
//  센서 부재의 뜻([CON-02] 규칙 4): lux 가 null 이면 **아무 전이도 없다**(모르는 것을
//  어둡다고 추측하지 않는다). snd 가 null 이면 소리 조건은 **충족으로 간주**한다 —
//  마이크 권한이 거부돼도 조도만으로 루프가 성립해야 한다([ARCH-01] R8 의 정신).
//
//  이 파일은 눈을 모른다. 모드 → 눈 상태 유도는 face/mode-eyes.js(H 소유)가
//  [CON-02] 규칙 4 로 한다 — 발행자가 소비자를 조작하지 않는다([CON-02] 규칙 1).

export const MODES = ['PLAY', 'WIND_DOWN', 'SLEEP', 'WAKE'];

// 기본 상수 — 전부 실측 튜닝 대상. mode.js 가 ?dark=&bright=&quiet=&noise=&windDownS=
// &sleepS=&wakeS= 로 덮어쓴다. lux 는 lux.js 의 상대값(카메라: sRGB 디코드 0~5000,
// 보드: 0~4095)이고 소리는 RMS 0~1 이다.
export const DEFAULTS = Object.freeze({
  darkLux: 40,        // 이보다 어두우면 "불을 껐다"
  brightLux: 200,     // 이보다 밝으면 "불을 켰다"
  quietLevel: 0.05,   // RMS — 이보다 조용하면 "조용하다"
  noiseLevel: 0.12,   // RMS — 이보다 크면 "소리가 있다"
  windDownS: 60,      // PLAY ⇄ WIND_DOWN: 조도 1분 지속
  sleepS: 300,        // WIND_DOWN → SLEEP: 어둡고 조용함 5분 지속
  wakeS: 300,         // SLEEP → WAKE: 밝고 소리 있음 5분 지속
});

export const COMMANDS = Object.freeze({ play: 'PLAY', windDown: 'WIND_DOWN', sleep: 'SLEEP', wake: 'WAKE' });

// 전이 규칙 표 — 모드마다 [{to, cause, need(초), cond(env)}]. 첫 매칭이 후보가 된다.
// cause 어휘는 [CON-02] 의 것이다: lux1m · lux+quiet5m · lux+noise5m · command · start
function buildRules(p) {
  const dark   = (e) => e.lux !== null && e.lux < p.darkLux;
  const bright = (e) => e.lux !== null && e.lux > p.brightLux;
  const quiet  = (e) => e.snd === null || e.snd < p.quietLevel;
  const noise  = (e) => e.snd === null || e.snd > p.noiseLevel;
  return {
    PLAY:      [{ to: 'WIND_DOWN', cause: 'lux1m',       need: p.windDownS, cond: dark }],
    WIND_DOWN: [{ to: 'SLEEP',     cause: 'lux+quiet5m', need: p.sleepS,    cond: (e) => dark(e) && quiet(e) },
                { to: 'PLAY',      cause: 'lux1m',       need: p.windDownS, cond: bright }],
    SLEEP:     [{ to: 'WAKE',      cause: 'lux+noise5m', need: p.wakeS,     cond: (e) => bright(e) && noise(e) }],
    WAKE:      [],   // 기상 뒤 새 세션은 명령(시작 버튼)으로만 — 저절로 놀이로 돌아가지 않는다
  };
}

/**
 * createModeMachine({ params, t0 }) → 머신.
 *   feed({t, lux, snd})  → 이벤트 배열. {type:'mode:change', from, to, cause, t} 또는
 *                          {type:'mode:progress', to, elapsed, need} (후보 없으면 to:null)
 *   command(cmd, t)      → 'play'|'windDown'|'sleep'|'wake'. 즉시 전이(cause 'command').
 *                          같은 모드면 빈 배열.
 *   mode · since · candidate · params — 계측용 읽기.
 */
export function createModeMachine(opts = {}) {
  const params = Object.freeze(Object.assign({}, DEFAULTS, opts.params || {}));
  const rules = buildRules(params);
  const m = { mode: 'PLAY', since: opts.t0 || 0, cand: null };

  function transition(to, cause, t) {
    const from = m.mode;
    m.mode = to; m.since = t; m.cand = null;
    return { type: 'mode:change', from, to, cause, t };
  }

  return {
    params,
    get mode() { return m.mode; },
    get since() { return m.since; },
    get candidate() { return m.cand ? Object.assign({}, m.cand) : null; },

    feed(env) {
      const e = { t: env.t, lux: env.lux == null ? null : env.lux, snd: env.snd == null ? null : env.snd };
      const hit = rules[m.mode].find((r) => r.cond(e));
      if (!hit) {
        // 조건이 깨졌다 — 타이머 리셋(히스테리시스). 후보가 있었을 때만 진행 이벤트로 알린다.
        if (m.cand) { m.cand = null; return [{ type: 'mode:progress', to: null, elapsed: 0, need: 0 }]; }
        return [];
      }
      if (!m.cand || m.cand.to !== hit.to) m.cand = { to: hit.to, cause: hit.cause, need: hit.need, from: e.t };
      const elapsed = e.t - m.cand.from;
      if (elapsed >= m.cand.need) return [transition(hit.to, hit.cause, e.t)];
      return [{ type: 'mode:progress', to: m.cand.to, elapsed, need: m.cand.need }];
    },

    command(cmd, t) {
      const to = COMMANDS[cmd];
      if (!to || to === m.mode) return [];
      return [transition(to, 'command', t)];
    },
  };
}
