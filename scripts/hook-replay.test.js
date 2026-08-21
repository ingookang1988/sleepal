// scripts/hook-replay.test.js
// 순수 집계(replay) 테스트 — 인덱스는 스텁. 실행: node scripts/hook-replay.test.js
const { replay } = require('./hook-replay');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

const root = process.cwd();
const IDX = [
  { domain: 'PLAN', id: '01a', file: '.union-stack/plan/PLAN-01a_x.md', status: 'Verifying' },
  { domain: 'PLAN', id: '02', file: '.union-stack/plan/PLAN-02_y.md', status: 'Draft' },
];

// Schema tier 편집 → enforce에서 차단
const r1 = replay(['.union-stack/architecture/ARCH-01_x.md'], IDX, root);
check('schema 차단 1건', r1.blocked === 1 && r1.byKind.schema === 1);
check('blockRate 1.0', r1.blockRate === 1);

// Wiki 경로 → 통과
const r2 = replay(['.union-stack/feature/live.md', 'scripts/x.js'], IDX, root);
check('wiki·코드 통과', r2.blocked === 0 && r2.blockRate === 0);

// 잠금 자손(01a Verifying) 있는 부모 편집 → lock 차단
const r3 = replay(['.union-stack/plan/PLAN-01_z.md'], IDX, root);
check('lock 차단', r3.blocked === 1 && r3.byKind.lock === 1);

// 집계·경로 카운트
const r4 = replay(['.union-stack/architecture/A-01_a.md', '.union-stack/architecture/A-01_a.md', 'README.md'], IDX, root);
check('편집 3건 중 2건 차단', r4.edits === 3 && r4.blocked === 2);
check('경로별 카운트', r4.paths['schema:.union-stack/architecture/A-01_a.md'] === 2);
check('빈 입력 → rate null', replay([], IDX, root).blockRate === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
