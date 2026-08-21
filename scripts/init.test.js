// scripts/init.test.js
// 순수 계획 함수(planOps) 단위 테스트. FS 비의존. 실행: node scripts/init.test.js
const { planOps } = require('./init');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

const files = [
  '.union-stack/project/IDENTITY_example.md',
  '.union-stack/project/_GUIDE.md',
  '.union-stack/project/HISTORY.md',
  '.union-stack/plan/PLAN-01_example_feature.md',
  '.union-stack/plan/_GUIDE.md',
  '.union-stack/plan/meetings/MTG-01a_example_kickoff.md',
  '.union-stack/architecture/ARCH-00_zfs_naming.md',
  '.union-stack/architecture/ARCH-01_example_layers.md',
  '.union-stack/architecture/infra/INF-01_example_deploy.md',
  '.union-stack/reference/contracts/CON-00_test_infra_catalog.md',
  '.union-stack/reference/contracts/CON-01_shared_types.md',
  '.union-stack/feature/live.md',
  '.union-stack/archive_ledger.md',
  'package.json',
  'scripts/leakage-guard.js',
  'scripts/zfs_index.test.js',
  '.github/workflows/template-guard.yml',
];

const ops = planOps({ name: 'My Project', slug: 'my_project', drop: false, files });
const has = (op, p) => ops.some(o => o.op === op && o.path === p);
const opOf = p => ops.find(o => o.path === p)?.op;

// 정체성 시딩
check('identity 시딩', ops.some(o => o.op === 'identity' && o.to === '.union-stack/project/IDENTITY.md' && o.name === 'My Project'));
// 더미 제거
check('PLAN example 삭제', has('delete', '.union-stack/plan/PLAN-01_example_feature.md'));
check('MTG example 삭제', has('delete', '.union-stack/plan/meetings/MTG-01a_example_kickoff.md'));
check('ARCH-01 example 삭제', has('delete', '.union-stack/architecture/ARCH-01_example_layers.md'));
check('INF example 삭제', has('delete', '.union-stack/architecture/infra/INF-01_example_deploy.md'));
check('CON-00 삭제(명시 더미)', has('delete', '.union-stack/reference/contracts/CON-00_test_infra_catalog.md'));
check('CON-01 삭제(명시 더미)', has('delete', '.union-stack/reference/contracts/CON-01_shared_types.md'));
// 보존
check('_GUIDE 보존(project)', opOf('.union-stack/project/_GUIDE.md') === undefined);
check('_GUIDE 보존(plan)', opOf('.union-stack/plan/_GUIDE.md') === undefined);
check('ARCH-00 보존(방법론)', opOf('.union-stack/architecture/ARCH-00_zfs_naming.md') === undefined);
// 매니페스트 초기화
check('HISTORY reset', has('reset', '.union-stack/project/HISTORY.md'));
check('live reset', has('reset', '.union-stack/feature/live.md'));
check('archive_ledger reset', has('reset', '.union-stack/archive_ledger.md'));
// 회전본([PRO-18])은 상류의 결정 기록이다 — 머리만 비우고 두면 어답터가 상류 ADR 을 물려받는다.
const rot = planOps({ name: 'X', slug: 'x', files: [
  '.union-stack/archive_ledger.md',
  '.union-stack/archive_ledger/ADR-02_25.md',
  '.union-stack/archive_ledger/_GUIDE.md',
] });
const rotOp = p => rot.find(o => o.path === p)?.op;
check('회전본 삭제', rotOp('.union-stack/archive_ledger/ADR-02_25.md') === 'delete');
check('회전본 머리는 reset(삭제 아님)', rotOp('.union-stack/archive_ledger.md') === 'reset');
check('회전본 디렉터리의 _GUIDE 는 보존', rotOp('.union-stack/archive_ledger/_GUIDE.md') === undefined);
// pkg
check('pkg op', ops.some(o => o.op === 'pkg' && o.name === 'my_project' && o.version === '0.1.0'));
// 기본은 템플릿 자산 보존
check('기본: leakage-guard 보존', opOf('scripts/leakage-guard.js') === undefined);
check('기본: template-guard.yml 보존', opOf('.github/workflows/template-guard.yml') === undefined);

// --drop: 템플릿 자산 제거
const dropOps = planOps({ name: 'X', slug: 'x', drop: true, files });
const dropHas = p => dropOps.some(o => o.op === 'delete' && o.path === p && o.templateBit);
check('drop: leakage-guard 삭제', dropHas('scripts/leakage-guard.js'));
check('drop: zfs_index.test 삭제', dropHas('scripts/zfs_index.test.js'));
check('drop: template-guard.yml 삭제', dropHas('.github/workflows/template-guard.yml'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
