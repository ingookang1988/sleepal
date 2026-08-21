#!/usr/bin/env node
// scripts/eval-arm.js
// 시나리오 A/B **팔 단위 집계·비교기** — E6(`eval/PROTOCOL.md` §3-bis)의 실행 리그.
// 두 팔의 전사 디렉터리를 받아 런별 비용을 내고, 델타 + 소표본 유의성 + 품질 비악화를 합쳐
// **성공 바를 기계로 판정**한다(성공 바 = 턴 또는 토큰 유의미 감소 AND 품질 비악화).
//
// 왜 별도 도구인가(session-friction으로 안 되는 이유):
//   ① `session-friction`은 디렉터리 전체를 *하나의 기준선*으로 뭉갠다 — 팔은 런별 분포가 필요하다.
//   ② 그 기준선은 **살아 움직인다**(작업 중인 세션이 실시간으로 분모에 들어온다). 팔은 고정 대조군이어야 한다.
//   ③ 서브에이전트로 돌린 팔은 애초에 보이지 않는다 — `readEvents`가 sidechain 발화를 세그먼트로 열지 않아
//      팔의 의도가 0건이 되고 토큰만 부모 의도에 가산된다.
//   ⇒ **팔은 top-level 세션으로, 팔마다 격리된 전사 디렉터리에서 돌려야 한다**(수단: [TOOL-14] worktree —
//      워크스페이스 경로가 갈리면 전사 디렉터리도 갈린다). 이 도구는 그 격리를 전제로 한다.
//
// ⚠ 과거 실측 기준선을 팔 ①로 쓰지 말 것. ①도 **같은 과제 스위트로 재실행**한 디렉터리여야 한다
//   (자연 작업 분포 vs 통제 과제는 난이도가 달라, 델타가 시나리오 효과인지 과제 차인지 분리되지 않는다).
//
// 정직한 한계: ① 유의성은 Mann–Whitney U 정확 임계표(양측 α=.05, 등표본 n=4~10)다 — 그 밖은 판정 보류(null).
//   ② 품질은 [TOOL-18] 루브릭의 관측 가능한 두 항목뿐이며 종료 코드를 보지 않는다.
//   ③ 런당 의도가 1건이 아니면(추가 발화) 분모가 오염되므로 경고를 낸다.
// read-only·zero-dep. 실행: node scripts/eval-arm.js <arm1-dir> <arm2-dir> [--n 5] [--json]
const path = require('path');
const { segment, readEvents } = require('./session-friction');
const { judgeDir } = require('./scenario-rubric');

// Mann–Whitney U 정확 임계값(양측 α=0.05, n1=n2). U ≤ 임계값이면 유의.
// n=3은 양측 .05를 달성할 수 없다(최소 U=0에서도 p>.05) → 표에 없음 = 판정 보류.
const U_CRIT = { 4: 0, 5: 2, 6: 5, 7: 8, 8: 13, 9: 17, 10: 23 };

/** 순위합 기반 Mann–Whitney U(동점은 평균 순위). 순수. */
function uTest(a, b) {
  const n1 = a.length, n2 = b.length;
  if (!n1 || !n2) return { U: null, crit: null, significant: null, note: '표본 없음' };
  const all = [...a.map(v => ({ v, g: 0 })), ...b.map(v => ({ v, g: 1 }))].sort((x, y) => x.v - y.v);
  const ranks = new Array(all.length);
  for (let i = 0; i < all.length;) {
    let j = i;
    while (j + 1 < all.length && all[j + 1].v === all[i].v) j++;
    const r = (i + j + 2) / 2;                       // 1-기반 평균 순위
    for (let k = i; k <= j; k++) ranks[k] = r;
    i = j + 1;
  }
  const R1 = all.reduce((s, e, i) => s + (e.g === 0 ? ranks[i] : 0), 0);
  const U1 = R1 - n1 * (n1 + 1) / 2;
  const U2 = n1 * n2 - U1;
  const U = Math.min(U1, U2);
  const crit = n1 === n2 ? (U_CRIT[n1] ?? null) : null;
  return {
    U, U1, U2, crit,
    significant: crit === null ? null : U <= crit,
    note: crit === null ? (n1 === n2 ? `n=${n1}은 임계표 밖(4~10)` : '비등표본 — 정확표 미적용') : null,
  };
}

const mean = v => (v.length ? +(v.reduce((a, x) => a + x, 0) / v.length).toFixed(2) : null);
const median = v => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

/**
 * 세그먼트 배열 → 런(=세션)별 비용 행(순수).
 * 런 1개 = 세션 1개 = 과제 1건이라는 프로토콜을 전제하되, 위반(의도≥2)은 경고로 드러낸다.
 */
function runsOf(segs) {
  const by = new Map();
  for (const s of segs) {
    const r = by.get(s.session) || { session: s.session, intents: 0, turns: 0, outTok: 0, toolCalls: 0, subTurns: 0 };
    r.intents++; r.turns += s.turns; r.outTok += s.outTok; r.toolCalls += s.toolCalls; r.subTurns += s.subTurns;
    by.set(s.session, r);
  }
  return [...by.values()].map(r => ({
    ...r,
    turnsPerIntent: +(r.turns / r.intents).toFixed(2),
    outTokPerIntent: Math.round(r.outTok / r.intents),
  })).sort((a, b) => a.session.localeCompare(b.session));
}

/** 런 행 + 루브릭 → 팔 요약(순수). */
function summarize(label, runs, rubric, expectedN) {
  const turns = runs.map(r => r.turnsPerIntent), toks = runs.map(r => r.outTokPerIntent);
  const warnings = [];
  if (expectedN && runs.length !== expectedN) warnings.push(`런 ${runs.length}개 — 설계상 N=${expectedN}`);
  const multi = runs.filter(r => r.intents > 1);
  if (multi.length) warnings.push(`의도 2건 이상인 런 ${multi.length}개(1과제=1발화 위반 → 분모 오염): ${multi.map(r => `${r.session.slice(0, 8)}(${r.intents})`).join(', ')}`);
  if (!runs.length) warnings.push('런 없음 — 전사 디렉터리를 확인하라');
  return {
    label, runs: runs.length, rows: runs, warnings,
    meanTurns: mean(turns), medianTurns: median(turns),
    meanOutTok: mean(toks) === null ? null : Math.round(mean(toks)), medianOutTok: median(toks),
    quality: rubric ? { okRuns: rubric.okRuns, failRuns: rubric.failRuns, okRate: rubric.okRate,
      meanEditFiles: rubric.meanEditFiles, byRun: rubric.runs } : null,
  };
}

const pct = (a, b) => (a === null || b === null || !a ? null : +(((b - a) / a) * 100).toFixed(1));

/** 팔 둘 → 델타·유의성·성공 바 판정(순수). */
function compare(a1, a2) {
  const t1 = a1.rows.map(r => r.turnsPerIntent), t2 = a2.rows.map(r => r.turnsPerIntent);
  const k1 = a1.rows.map(r => r.outTokPerIntent), k2 = a2.rows.map(r => r.outTokPerIntent);
  const turns = { ...uTest(t1, t2), delta: pct(a1.meanTurns, a2.meanTurns), down: a2.meanTurns < a1.meanTurns };
  const tokens = { ...uTest(k1, k2), delta: pct(a1.meanOutTok, a2.meanOutTok), down: a2.meanOutTok < a1.meanOutTok };
  const costWin = (turns.significant === true && turns.down) || (tokens.significant === true && tokens.down);
  // 품질 비악화: ② 실패 런 수가 ①보다 많지 않을 것. 루브릭이 없으면 판정 보류.
  const q = (a1.quality && a2.quality) ? a2.quality.failRuns <= a1.quality.failRuns : null;
  return {
    turns, tokens, costWin, qualityHeld: q,
    verdict: q === null ? 'inconclusive' : (costWin && q ? 'pass' : 'fail'),
    reason: q === null ? '루브릭 없음 — 품질 비악화 판정 불가'
      : !costWin ? '비용 감소가 유의하지 않음(또는 증가) — §3-bis 반증 처리로'
        : !q ? '품질 악화 — 비용이 줄어도 성공 바 미달' : '턴/토큰 유의미 감소 AND 품질 비악화',
  };
}

function run(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  const nArg = argv.findIndex(a => a === '--n');
  const expectedN = nArg >= 0 ? Number(argv[nArg + 1]) : 5;
  const dirs = argv.filter((a, i) => !a.startsWith('--') && !(nArg >= 0 && i === nArg + 1));
  if (dirs.length < 2) {
    console.error('사용법: node scripts/eval-arm.js <arm1-dir(①무시나리오)> <arm2-dir(②강제)> [--n 5] [--json]');
    return 2;
  }
  const arms = dirs.slice(0, 2).map((d, i) => summarize(
    i === 0 ? '① 무시나리오' : '② 강제', runsOf(segment(readEvents(d))), judgeDir(d), expectedN,
  )).map((a, i) => ({ ...a, dir: dirs[i] }));
  const cmp = compare(arms[0], arms[1]);

  if (json) { console.log(JSON.stringify({ arms, comparison: cmp }, null, 2)); return cmp.verdict === 'pass' ? 0 : 1; }
  console.log(`# eval-arm — E6 시나리오 A/B (N=${expectedN}/팔)`);
  for (const a of arms) {
    console.log(`\n## ${a.label}  (${path.basename(a.dir)}) — 런 ${a.runs}개`);
    console.log(`  의도당 턴   평균 ${a.meanTurns}  (중앙값 ${a.medianTurns})`);
    console.log(`  의도당 출력 tok 평균 ${a.meanOutTok}  (중앙값 ${a.medianOutTok})`);
    if (a.quality) console.log(`  품질(루브릭): 통과 ${a.quality.okRuns} / 실패 ${a.quality.failRuns} · 편집파일 ${a.quality.meanEditFiles}개/런`);
    a.warnings.forEach(w => console.log(`  ⚠ ${w}`));
  }
  const line = (name, m) => console.log(`  ${name.padEnd(6)} 델타 ${m.delta === null ? 'n/a' : (m.delta > 0 ? '+' : '') + m.delta + '%'}` +
    `  U=${m.U === null ? 'n/a' : m.U}${m.crit === null ? '' : `/임계 ${m.crit}`}` +
    `  유의 ${m.significant === null ? '보류' : m.significant ? '예' : '아니오'}${m.note ? ' (' + m.note + ')' : ''}`);
  console.log('\n## 비교 (②−①)');
  line('턴', cmp.turns); line('토큰', cmp.tokens);
  console.log(`  품질 비악화: ${cmp.qualityHeld === null ? '판정 불가' : cmp.qualityHeld ? '유지' : '악화'}`);
  console.log(`\n  성공 바 판정: **${cmp.verdict}** — ${cmp.reason}`);
  if (cmp.verdict === 'pass') console.log('  → 델타를 카드 `evidence[]`에 {eval_run, delta, n, date}로 고정한 뒤에만 status: Draft → Active.');
  else console.log('  → §3-bis 반증 처리: 개정 1회 후 재측정, 그래도 ≤0이면 해당 아키타입 폐기하고 근거를 원장에.');
  return cmp.verdict === 'pass' ? 0 : 1;
}

module.exports = { uTest, runsOf, summarize, compare, U_CRIT };

if (require.main === module) process.exit(run());
