// scripts/eval-arm.test.js
// 순수 함수(uTest·runsOf·summarize·compare) 테스트 — FS 비의존. 실행: node scripts/eval-arm.test.js
const { uTest, runsOf, summarize, compare } = require('./eval-arm');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

// --- uTest ---
// 완전 분리(모든 b < 모든 a), n=5 → U=0 ≤ 임계 2 → 유의
const sep = uTest([10, 11, 12, 13, 14], [1, 2, 3, 4, 5]);
check('완전 분리 U=0', sep.U === 0 && sep.crit === 2 && sep.significant === true);
// 동일 분포 → U 최대(=n1*n2/2=12.5 → min은 12 또는 13) → 유의 아님
const same = uTest([1, 2, 3, 4, 5], [1, 2, 3, 4, 5]);
check('동일 분포 유의 아님', same.significant === false);
// 겹침 1칸: a=[3,4,5,6,7] b=[1,2,3,4,5] → 유의하지 않아야
check('부분 겹침 유의 아님', uTest([3, 4, 5, 6, 7], [1, 2, 3, 4, 5]).significant === false);
// U1+U2 = n1*n2 항등식(동점 포함)
const tie = uTest([1, 2, 2, 3, 9], [2, 2, 4, 5, 6]);
check('U 항등식', tie.U1 + tie.U2 === 25);
// 소표본·비등표본 → 판정 보류
check('n=3 판정 보류', uTest([1, 2, 3], [4, 5, 6]).significant === null);
check('비등표본 판정 보류', uTest([1, 2, 3, 4, 5], [6, 7, 8, 9]).significant === null);
check('빈 표본 보류', uTest([], [1, 2]).significant === null);
// n=4 임계 0 — 완전 분리에서만 유의
check('n=4 완전분리 유의', uTest([5, 6, 7, 8], [1, 2, 3, 4]).significant === true);
check('n=4 한칸 겹침 비유의', uTest([4, 6, 7, 8], [1, 2, 3, 5]).significant === false);

// --- runsOf ---
const segs = [
  { session: 's1', turns: 10, outTok: 1000, toolCalls: 5, subTurns: 0 },
  { session: 's2', turns: 20, outTok: 2000, toolCalls: 9, subTurns: 1 },
  { session: 's2', turns: 10, outTok: 1000, toolCalls: 1, subTurns: 0 },
];
const rows = runsOf(segs);
check('세션별 2런', rows.length === 2);
check('s1 의도 1건', rows[0].intents === 1 && rows[0].turnsPerIntent === 10);
check('s2 의도 2건 합산·평균', rows[1].intents === 2 && rows[1].turns === 30 && rows[1].turnsPerIntent === 15);
check('s2 토큰 평균', rows[1].outTokPerIntent === 1500);

// --- summarize ---
const mk = (session, t, k) => ({ session, intents: 1, turns: t, outTok: k, turnsPerIntent: t, outTokPerIntent: k });
const rub = n => ({ okRuns: n, failRuns: 5 - n, okRate: n / 5, meanEditFiles: 2, runs: [] });
const A1 = summarize('①', [mk('a', 20, 5000), mk('b', 22, 5200), mk('c', 24, 5400), mk('d', 26, 5600), mk('e', 28, 5800)], rub(4), 5);
const A2 = summarize('②', [mk('f', 10, 3000), mk('g', 11, 3100), mk('h', 12, 3200), mk('i', 13, 3300), mk('j', 14, 3400)], rub(5), 5);
check('평균 턴 집계', A1.meanTurns === 24 && A2.meanTurns === 12);
check('중앙값', A1.medianTurns === 24 && A2.medianOutTok === 3200);
check('경고 없음(N일치·의도1)', A1.warnings.length === 0);
check('N 불일치 경고', summarize('x', [mk('a', 1, 1)], rub(1), 5).warnings.some(w => w.includes('N=5')));
check('의도 2건 경고', summarize('x', [{ ...mk('a', 10, 10), intents: 2 }], rub(1), 1).warnings.some(w => w.includes('분모 오염')));
check('런 없음 경고', summarize('x', [], null, 5).warnings.some(w => w.includes('런 없음')));

// --- compare ---
const good = compare(A1, A2);
check('턴 유의 감소', good.turns.significant === true && good.turns.down === true);
check('턴 델타 −50%', good.turns.delta === -50);
check('품질 유지', good.qualityHeld === true);
check('성공 바 pass', good.verdict === 'pass');

// 비용은 줄었으나 품질 악화 → fail
const A2bad = summarize('②', A2.rows, rub(2), 5);
check('품질 악화 → fail', compare(A1, A2bad).verdict === 'fail');

// 비용 증가 → fail
check('비용 증가 → fail', compare(A2, A1).verdict === 'fail');

// 겹치는 분포(비유의) → fail
const A2mid = summarize('②', [mk('f', 21, 5100), mk('g', 23, 5300), mk('h', 25, 5500), mk('i', 27, 5700), mk('j', 19, 4900)], rub(5), 5);
check('비유의 → fail', compare(A1, A2mid).verdict === 'fail');

// 루브릭 없음 → inconclusive
check('루브릭 없음 → inconclusive', compare(summarize('①', A1.rows, null, 5), summarize('②', A2.rows, null, 5)).verdict === 'inconclusive');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
