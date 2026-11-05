// scripts/retro.test.js
// 회고 트리거 순수 로직([PRO-25] ①②④ v0.2): 지표 7 · 임계 덮어쓰기/off · Δ · 스냅샷 파싱 · 회차 글자 · 기록 렌더 · CLI. 실행: node scripts/retro.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { computeIndicators, thresholds, parseSnapshot, nextLetter, renderRecord, CONTRACT, DEFAULTS } = require('./retro');
const { validateContract } = require('./gate-contract');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

check('계약 선언 완전 · REJECT 없음(관측)', validateContract(CONTRACT).length === 0 && !CONTRACT.outcomes.includes('REJECT'));

const base = {
  woTotal: 50, prev: null, archiveDebt: 2, stale: [{ id: '01a-1', days: 40 }, { id: '02', days: 3 }], gcPlans: [],
  planes: [{ name: 'live', last: '2026-09-01' }, { name: 'gap', last: '2026-10-10' }, { name: 'evidence', last: null }], generated: [{ name: 'state', last: null }],
  latestWoDate: '2026-10-16', distillClosed: 12, lsnLast: '2026-08-20', ledgerKb: 22, dateSource: 'git', statusDist: { Closed: 40, Active: 10 },
};
const r0 = computeIndicators(base);
check('지표 7', r0.indicators.length === 7 && r0.indicators.map(i => i.key).join() === 'issuance,archiveDebt,stale,gcPlans,planeLag,distill,ledgerKb');
check('회고 기록 없으면 발행 증분은 기준 없음(초과 아님)', r0.indicators[0].value === null && !r0.indicators[0].over && /기준 없음/.test(r0.indicators[0].note));
check('정체 WO: 30일 이상만 센다(1)', r0.indicators[2].value === 1 && !r0.indicators[2].over);
check('평면 지연: 가장 낡은 평면 기준(live 45d) → 초과', r0.indicators[4].value === 45 && r0.indicators[4].over && /live 2026-09-01\(45d\)/.test(r0.indicators[4].note));
check('생성 뷰(state)는 별도 INFO 로 병기', /생성 뷰 state 안 돌림/.test(r0.indicators[4].note));
check('due + 사유', r0.due && r0.reasons.length === 1 && /평면 지연/.test(r0.reasons[0]));

// 임계 덮어쓰기 · off
const cfg = { retro: { planeLagDays: 60, archiveDebt: 1, off: ['ledger'] } };
const r1 = computeIndicators({ ...base, ledgerKb: 300 }, cfg);
check('adapter retro: 임계 덮어쓰기(planeLag 60 → 미초과 · archiveDebt 1 → 초과)', !r1.indicators[4].over && r1.indicators[1].over);
check('off 목록은 지표를 끈다(원장 300KB 여도 미초과)', !r1.indicators[6].over && /끔/.test(r1.indicators[6].note));
check('thresholds: 숫자 아닌 값은 무시', thresholds({ retro: { issuance: 'x' } }).t.issuance === DEFAULTS.issuance);

// 직전 회고 스냅샷 → 발행 증분 · Δ
const prev = { date: '2026-09-01', snap: { woTotal: 15, archiveDebt: 7, stale: 0, ledgerKb: 20 } };
const r2 = computeIndicators({ ...base, prev }, { retro: { planeLagDays: 999 } });
check('발행 증분 = 전체 − 직전 스냅샷(35) → 초과', r2.indicators[0].value === 35 && r2.indicators[0].over);
check('Δ: 스냅샷에 있는 지표만', r2.delta.map(d => d.key).join() === 'archiveDebt,stale,ledgerKb' && r2.delta[0].prev === 7 && r2.delta[0].now === 2);
check('GC PLAN ≥1 초과', computeIndicators({ ...base, gcPlans: ['07'], planes: [] }).indicators[3].over);
check('증류 정체 ≥30 초과', computeIndicators({ ...base, distillClosed: 31, planes: [] }).indicators[5].over);

// 스냅샷 파싱 · 회차 글자
check('parseSnapshot', JSON.stringify(parseSnapshot('---\nid: ANL-00a\nwo_total: 12\nsnap_stale: 3\nsnap_ledgerKb: 21.5\n---\n# x')) === '{"stale":3,"ledgerKb":21.5,"woTotal":12}');
check('parseSnapshot: frontmatter 없으면 null', parseSnapshot('# x') === null);
check('parseSnapshot: -1(값 없음)은 싣지 않는다', JSON.stringify(parseSnapshot('---\nsnap_issuance: -1\nsnap_stale: 2\n---')) === '{"stale":2}');
check('nextLetter: 없으면 a · l·o 건너뜀 · k 다음 m', nextLetter([]) === 'a' && nextLetter(['a', 'b']) === 'c' && nextLetter(['k']) === 'm' && nextLetter(['n']) === 'p');

// 기록 렌더
const rec = renderRecord({ ...r2, input: base }, { letter: 'a', date: '2026-10-17' });
check('기록: frontmatter 스냅샷 7 + wo_total + parent', (rec.match(/^snap_\w+: /gm) || []).length === 7 && /^wo_total: 50$/m.test(rec) && /^parent: PRO-25$/m.test(rec) && /^id: ANL-00a$/m.test(rec));
check('기록: 체크리스트 8 · Δ 절 · 예시 아님 표식', (rec.match(/^\| [1-8] \|/gm) || []).length === 8 && rec.includes('## 1-bis. 직전 회고 대비 Δ') && rec.includes('예시 아님'));
check('기록: 어답터는 up:PRO-25', /^parent: up:PRO-25$/m.test(renderRecord({ ...r0, input: base }, { letter: 'b', date: '2026-10-17', parentRef: 'up:PRO-25' })));
check('값 없는 지표는 -1 로 스냅샷(비움과 0 구별)', /^snap_issuance: -1$/m.test(renderRecord({ ...r0, input: base }, { letter: 'a', date: '2026-10-17' })));

// CLI: 상류 자신 --json (exit 0/3 중 하나 · 지표 7)
const r = spawnSync(process.execPath, ['scripts/retro.js', '--json'], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
let j = null;
try { j = JSON.parse(r.stdout); } catch { /* null */ }
check('CLI --json: 지표 7 · 종료코드 0|3', !!j && j.indicators.length === 7 && [0, 3].includes(r.status) && (r.status === 3) === j.due);
const bad = spawnSync(process.execPath, ['scripts/retro.js', '--root', path.join(os.tmpdir(), 'no-such-retro-root')], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
check('CLI --root 무효 → CLARIFY(3)', bad.status === 3);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
