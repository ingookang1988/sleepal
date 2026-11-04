// scripts/census_round.test.js
// census 최신 회차 판독(순수 + 픽스처). 실행: node scripts/census_round.test.js
const fs = require('fs'), os = require('os'), path = require('path');
const { latestRound, handoffLine, daysSince, newCount, RAW_DIR, STALE_DAYS } = require('./census_round');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cround-'));
try {
  check('원자료 디렉터리 없음(어답터) → null', latestRound(tmp) === null);
  const dir = path.join(tmp, RAW_DIR);
  fs.mkdirSync(dir, { recursive: true });
  check('빈 디렉터리 → null', latestRound(tmp) === null);
  const w = (f, o) => fs.writeFileSync(path.join(dir, f), JSON.stringify(o));
  w('2026-10-17_A.json', { label: 'A', path: '/secret/a', delta: { first: true, new: ['gate:x'], persist: [], resolved: [] } });
  w('2026-10-19_A.json', { label: 'A', path: '/secret/a', delta: { first: false, new: ['sync:applicable'], persist: ['gate:x'], resolved: [] } });
  w('2026-10-19_C.json', { label: 'C', path: '/secret/c', delta: { first: false, new: ['rule:blocks-missing', 'weak:test-deleted'], persist: [], resolved: ['gate:y'] } });
  w('2026-10-19_B.json', { label: 'B', path: '/secret/b' });   // 구 원자료(델타 없음)
  fs.writeFileSync(path.join(dir, 'broken_Z.json'), '{');
  const r = latestRound(tmp);
  check('최신 회차 날짜 = 가장 늦은 원자료', r.date === '2026-10-19');
  check('레이블별 최신 원자료만 · 정렬', JSON.stringify(r.rows.map(x => x.label)) === '["A","B","C"]' && r.rows[0].delta.new[0] === 'sync:applicable');
  check('경로는 결과에 없다(익명)', !JSON.stringify(r).includes('/secret'));
  check('신규 이탈 수 = 3(A 1 · C 2 · B 델타 없음 0)', newCount(r) === 3);
  const line = handoffLine(r);
  check('HANDOFF 한 줄: 신규 수 · 레이블별 키 · 날짜', line === '어답터 이탈 신규 3 (census 2026-10-19) — A sync:applicable · C rule:blocks-missing · weak:test-deleted');
  check('HANDOFF 한 줄: 신규 0', handoffLine({ date: '2026-10-19', rows: [{ label: 'A', delta: { first: false, new: [], persist: ['gate:x'], resolved: [] } }] }) === '어답터 이탈 신규 0 (census 2026-10-19)');
  check('HANDOFF 한 줄: 회차 없음', handoffLine(null) === '어답터 census 회차 없음 — node scripts/adopter-census.js --delta --write');
  check('HANDOFF 한 줄: 첫 회차 표기', /첫 회차/.test(handoffLine({ date: 'd', rows: [{ label: 'A', delta: { first: true, new: ['gate:x'], persist: [], resolved: [] } }] })));
  check('daysSince: 날짜 차', daysSince('2026-10-12', '2026-10-19') === 7 && daysSince('2026-10-11', '2026-10-19') === 8);
  check('STALE_DAYS = 7', STALE_DAYS === 7);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
