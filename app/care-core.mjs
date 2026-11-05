// care-core.mjs — 케어 문장: 순수 선택 로직 + 사전 문장 [WO-01c-1] (앱=통역사 층, [PLAN-01c])
//  눈은 상태를 말하고, 앱은 그 **이유**를 말한다. 그 이상은 하지 않는다.
//  DOM 의존 0 — scripts/care-core.test.js 가 R2·R6 린트와 선택 규칙을 node 에서 검사한다.
//
//  규범([ARCH-01]):
//   R2 — 주어는 언제나 팰. 2인칭·명령형 금지(린트가 잡는다).
//   R4 — NIGHT 에서는 **문장이 존재하되 출력 경로가 막혀 있다**: LINES.NIGHT 는 있고 careLine() 은 null 을 돌려준다.
//   R6 — 수치·점수·등급·비교 없음. "몇 번"은 허용, 숫자는 금지(린트).
//   R8 — 전부 사전 문장. 네트워크가 죽어도 이 파일이 폴백이다.
//  표시 정책([PLAN-01c]): 상시 표시하지 않는다 — 문장이 **바뀔 때만** 잠깐 떠올랐다 사라진다(care.js).

// 사전 문장 — 상태 5종 + 이유 문장. 키는 선택 규칙이 쓴다. 한 줄, 해요체, 주어 팰.
export const LINES = Object.freeze({
  AWAKE:        '팰이 깨어 있어요',
  DROWSY:       '팰이 졸려 해요',
  ASLEEP:       '팰이 잠들었어요',
  NIGHT:        '팰이 깊이 잠들어 있어요',          // 존재하되 출력되지 않는다(R4)
  MORNING:      '팰이 일어났어요',
  // 이유 — 왜 아직 안 자나 / 왜 깼나
  SETTLING:     '팰이 어둠에 눈이 익어가요',
  FALLING:      '팰이 잠들려고 해요',
  GLARE:        '팰이 눈부셔서 눈을 못 감고 있어요',
  NOISE:        '팰이 소리 때문에 자꾸 깨요',
  REWAKE:       '팰이 눈부셔서 다시 깨요',
  BLIND:        '팰이 방을 볼 수 없어서 밝기를 느끼지 못해요',
  // 아침 — 밤새 느낀 것(점수가 아니라 회고)
  NIGHT_CALM:   '팰은 밤새 어두운 방에서 푹 잤어요',
  NIGHT_LIGHT:  '팰은 밤중에 불빛에 몇 번 뒤척였어요',
  NIGHT_NOISE:  '팰은 밤중에 소리에 몇 번 깼어요',
  NIGHT_BOTH:   '팰은 밤중에 불빛과 소리에 몇 번 깼어요',
});

// R2·R6 린트(순수) — 사전 문장과 LLM 이 다듬은 문장 둘 다 통과해야 출력된다.
//  2인칭·사용자 지칭·명령/권유형 어미·숫자·채점 어휘를 잡는다. 위반 목록을 돌려준다(빈 배열 = 통과).
const R2_RE = /(당신|너[가는의를]?|네[가는]|그대|사용자|고객|님께|하세요|세요\b|십시오|해라|하라\b|해 ?주세요|주세요|봐요\b|보세요)/;
const R6_RE = /([0-9０-９]|점수|등급|보다 (늦|빠|길|짧)|대비|퍼센트|%|점\b)/;
export function lintLine(s) {
  const out = [];
  if (typeof s !== 'string' || !s.trim()) out.push('empty');
  else {
    if (!/^팰[이은의]/.test(s)) out.push('R2:subject');   // 주어가 팰이 아니다
    if (R2_RE.test(s)) out.push('R2:second-person');
    if (R6_RE.test(s)) out.push('R6:number-or-score');
    if (/\n/.test(s) || s.length > 40) out.push('one-line');
  }
  return out;
}

/**
 * careLine(ctx) → 문장 | null(출력 없음).
 *  ctx: { eye, mode, candidate(to|null), canSee(bool), dark(bool|null), noisy(bool|null), night:{bright, noise} }
 *  규칙 순서가 곧 우선순위다. NIGHT 는 무조건 null(R4).
 */
export function careLine(ctx) {
  const c = ctx || {};
  if (c.eye === 'NIGHT') return null;                       // ⛔ R4 — 밤의 출력 경로는 비어 있다
  if (c.eye === 'MORNING' || c.mode === 'WAKE') {
    const n = c.night || {};
    const b = n.bright > 0, s = n.noise > 0;
    return b && s ? LINES.NIGHT_BOTH : b ? LINES.NIGHT_LIGHT : s ? LINES.NIGHT_NOISE : LINES.NIGHT_CALM;
  }
  if (c.eye === 'ASLEEP' || c.mode === 'SLEEP') return LINES.ASLEEP;
  if (c.canSee === false) return LINES.BLIND;                // 방을 못 보면 이유를 먼저 — 밝기 문장은 거짓이 된다
  if (c.mode === 'WIND_DOWN') {
    if (c.candidate === 'SLEEP') return LINES.FALLING;
    if (c.candidate === 'PLAY') return LINES.REWAKE;
    if (c.dark === false) return LINES.GLARE;
    if (c.noisy === true) return LINES.NOISE;
    return LINES.DROWSY;
  }
  // PLAY(및 모드 미상)
  if (c.candidate === 'WIND_DOWN') return LINES.SETTLING;
  return c.eye === 'DROWSY' ? LINES.DROWSY : LINES.AWAKE;
}
