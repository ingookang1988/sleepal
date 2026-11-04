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

// --- [WO-29a-9] drop-template-bits 는 상류 전용 스크립트(ship-manifest upstreamOnly)도 지운다 — 남기면 어답터에 "지워도 된다" INFO 가 영구히 남고 census 약화 오탐 재료가 됐다 ---
{
  const UO = ['scripts/adopter-census.js', 'scripts/adopter-census.test.js', 'scripts/eval.js'];
  const fs2 = [...files, 'scripts/adopter-census.js', 'scripts/adopter-census.test.js'];   // eval.js 는 없다
  const d = planOps({ name: 'X', slug: 'x', drop: true, files: fs2, upstreamOnly: UO });
  const del = p => d.some(o => o.op === 'delete' && o.path === p && o.upstreamOnly);
  check('drop: 상류 전용 스크립트 삭제(있는 것만)', del('scripts/adopter-census.js') && del('scripts/adopter-census.test.js') && !d.some(o => o.path === 'scripts/eval.js'));
  check('drop 없으면 상류 전용도 남긴다', !planOps({ name: 'X', slug: 'x', drop: false, files: fs2, upstreamOnly: UO }).some(o => o.upstreamOnly));
  check('upstreamOnly 미지정(매니페스트 없음) → 현행(템플릿 비트만)', !planOps({ name: 'X', slug: 'x', drop: true, files: fs2 }).some(o => o.upstreamOnly) && planOps({ name: 'X', slug: 'x', drop: true, files: fs2 }).some(o => o.templateBit));
  // 지운 상류 전용 도구의 카드(impl 이 상류 전용)도 지운다 — 남기면 tool-linter 가 "impl 실존 안 함" 으로 red(실측: 드롭한 사본에서 카드 4+)
  const cards = { '.union-stack/reference/tools/TOOL-30_adopter_census.md': 'scripts/adopter-census.js', '.union-stack/reference/tools/TOOL-04_health.md': 'scripts/health.js' };
  const dc = planOps({ name: 'X', slug: 'x', drop: true, files: [...fs2, ...Object.keys(cards)], upstreamOnly: UO, cardImpl: cards });
  check('drop: impl 이 상류 전용인 카드 삭제 · 배송 도구 카드는 유지', dc.some(o => o.op === 'delete' && o.path === '.union-stack/reference/tools/TOOL-30_adopter_census.md' && o.upstreamOnly) && !dc.some(o => o.path === '.union-stack/reference/tools/TOOL-04_health.md'));
  check('같은 파일이 두 목록에 있어도 삭제는 한 번', planOps({ name: 'X', slug: 'x', drop: true, files: [...fs2, 'scripts/leakage-guard.js'], upstreamOnly: [...UO, 'scripts/leakage-guard.js'] }).filter(o => o.op === 'delete' && o.path === 'scripts/leakage-guard.js').length === 1);
}

// --- [WO-29a-11] init --adopt <repo>: dry-run 매핑안(대상 쓰기 0) · --out 파일 · .union-stack 있으면 거부 ---
{
  const fsA = require('fs'), osA = require('os'), pathA = require('path');
  const { main } = require('./init');
  const t = fsA.mkdtempSync(pathA.join(osA.tmpdir(), 'init-adopt-'));
  const o = fsA.mkdtempSync(pathA.join(osA.tmpdir(), 'init-adopt-out-'));
  const hush = fn => { const c = console.log, e = console.error; const out = []; console.log = (...a) => out.push(a.join(' ')); console.error = (...a) => out.push(a.join(' ')); try { return { code: fn(), out: out.join('\n') }; } finally { console.log = c; console.error = e; } };
  try {
    fsA.mkdirSync(pathA.join(t, 'docs/decisions'), { recursive: true });
    fsA.writeFileSync(pathA.join(t, 'docs/decisions/0001-db.md'), '# Use Postgres\n## Decision\n');
    const before = fsA.readdirSync(t, { recursive: true }).sort().join(',');
    const r = hush(() => main(['--adopt', t, '--out', pathA.join(o, 'plan.json')]));
    check('--adopt: exit 0 · 요약 출력', r.code === 0 && /high 1/.test(r.out));
    check('--adopt: --out JSON 에 rows·adapter', (() => { const j = JSON.parse(fsA.readFileSync(pathA.join(o, 'plan.json'), 'utf8')); return j.rows.length === 1 && j.rows[0].to === '.union-stack/archive_ledger.md' && !!j.adapter; })());
    check('--adopt: 대상 쓰기 0', fsA.readdirSync(t, { recursive: true }).sort().join(',') === before);
    check('--adopt: --name 없이 동작(이식은 이름을 묻지 않는다 — ③(b) 몫)', r.code === 0);
    fsA.mkdirSync(pathA.join(t, '.union-stack'));
    const r2 = hush(() => main(['--adopt', t]));
    check('--adopt: .union-stack 있으면 거부(exit 2)', r2.code === 2 && /이식 대상이 아니다/.test(r2.out));
    check('--adopt: 경로 없음 → exit 2', hush(() => main(['--adopt'])).code === 2);
  } finally { fsA.rmSync(t, { recursive: true, force: true }); fsA.rmSync(o, { recursive: true, force: true }); }
}

// --- [WO-29a-12] init --adopt <repo> --plan plan.json [--apply]: 계획 파일이 있으면 적용 경로 — 기본 dry-run(쓰기 0) · --apply 로만 쓴다 · 계획 없음·깨진 JSON 은 exit 2 ---
{
  const fsA = require('fs'), osA = require('os'), pathA = require('path');
  const { execFileSync } = require('child_process');
  const { main } = require('./init');
  const t = fsA.mkdtempSync(pathA.join(osA.tmpdir(), 'init-adopt-apply-'));
  const hush = fn => { const c = console.log, e = console.error; const out = []; console.log = (...a) => out.push(a.join(' ')); console.error = (...a) => out.push(a.join(' ')); try { return { code: fn(), out: out.join('\n') }; } finally { console.log = c; console.error = e; } };
  const git = (...a) => execFileSync('git', a, { cwd: t, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
    fsA.mkdirSync(pathA.join(t, 'docs/meetings'), { recursive: true });
    fsA.writeFileSync(pathA.join(t, 'docs/meetings/2026-02-02.md'), '# Meeting\n## Agenda\n');
    git('add', '-A'); git('commit', '-q', '-m', 'init');
    const planPath = pathA.join(t, '..', `plan-${pathA.basename(t)}.json`);
    hush(() => main(['--adopt', t, '--out', planPath]));
    check('--plan 없는 경로 → exit 2', hush(() => main(['--adopt', t, '--plan', pathA.join(t, 'nope.json')])).code === 2);
    const r = hush(() => main(['--adopt', t, '--plan', planPath]));
    check('--plan: dry-run exit 0 · 쓰기 0', r.code === 0 && git('status', '--porcelain') === '' && !fsA.existsSync(pathA.join(t, '.union-stack')));
    const r2 = hush(() => main(['--adopt', t, '--plan', planPath, '--apply']));
    check('--plan --apply: 적용(MTG 생김 · 앵커)', r2.code === 0 && fsA.readdirSync(pathA.join(t, '.union-stack/plan/meetings')).some(f => /^MTG-01_/.test(f)) && fsA.existsSync(pathA.join(t, '.union-stack/template-sync.json')));
    fsA.rmSync(planPath, { force: true });
  } finally { fsA.rmSync(t, { recursive: true, force: true }); }
}

// --- [WO-29a-3] init 이 새 프로젝트에 쓰는 리셋 템플릿의 상류 ID 는 up: 접두(상류 PRO 는 새 프로젝트에 없다) ---
{
  const { resetTemplate } = require('./init');
  const { extractRefs } = require('./ref-linter');
  const rc = resetTemplate('.union-stack/verification/raw/receipts.md');
  check('receipts 템플릿: [up:PRO-22]', rc.includes('[up:PRO-22]') && !rc.includes('[PRO-22]'));
  const all = ['.union-stack/verification/raw/receipts.md', '.union-stack/project/GRANTS.md', '.union-stack/sprint/HANDOFF.md', '.union-stack/archive_ledger.md'].map(resetTemplate).filter(Boolean);
  check('리셋 템플릿 전부: 접두 없는 상류 ID 0', all.length === 4 && all.every(t => extractRefs(t).every(r => r.external)));
  check('비-ID 대괄호는 그대로([RCPT] · 날짜)', rc.includes('[RCPT]') && rc.includes('[2026-01-01]'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
