// scripts/hooks.test.js
// 순수 결정 로직(decideEdit, extractWorkId) 단위 테스트. 실행: node scripts/hooks.test.js
const { decideEdit, extractWorkId, toRel } = require('./hooks');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

const root = process.cwd();

// --- 색인 스텁(순수 테스트 — FS 비의존) ---
const IDX = [
  { domain: 'PLAN', id: '01a', file: '.union-stack/plan/PLAN-01a_x.md', status: 'Verifying' },
  { domain: 'WO', id: '01a-1', file: '.union-stack/sprint/WO-01a-1_x.md', status: 'Done' },
  { domain: 'PLAN', id: '02', file: '.union-stack/plan/PLAN-02_y.md', status: 'Draft' },
];

// --- toRel ---
check('toRel keeps rel', toRel('.union-stack/plan/PLAN-02_y.md', root) === '.union-stack/plan/PLAN-02_y.md');

// --- decideEdit: off 모드는 항상 통과 ---
check('off = no block', decideEdit('.union-stack/architecture/ARCH-00.md', IDX, 'off', root).block === false);

// --- Schema tier: warn=경고(비차단), enforce=차단 ---
const sWarn = decideEdit('.union-stack/architecture/ARCH-00_zfs_naming.md', IDX, 'warn', root);
check('schema warn: issue present, not blocked', sWarn.block === false && sWarn.issues.some(i => i.kind === 'schema'));
const sEnf = decideEdit('.union-stack/architecture/ARCH-00_zfs_naming.md', IDX, 'enforce', root);
check('schema enforce: blocked', sEnf.block === true && sEnf.issues.some(i => i.kind === 'schema' && i.block));

// --- Wiki/other tier: Schema 이슈 없음 ---
const other = decideEdit('.union-stack/feature/live.md', IDX, 'enforce', root);
check('wiki not schema-blocked', !other.issues.some(i => i.kind === 'schema'));

// --- Blast-Radius 잠금: 부모(02, Draft) 편집인데 자손 잠금 없으면 통과 ---
const noLock = decideEdit('.union-stack/plan/PLAN-02_y.md', IDX, 'warn', root);
check('no locked descendant → no lock issue', !noLock.issues.some(i => i.kind === 'lock'));

// --- Blast-Radius 잠금: 01(부모) 편집 시 자손 PLAN-01a(Verifying) → 차단(모드 무관) ---
const locked = decideEdit('.union-stack/plan/PLAN-01_z.md', IDX, 'warn', root);
check('locked descendant → blocked even in warn', locked.block === true && locked.issues.some(i => i.kind === 'lock'));

// --- extractWorkId ---
check('extract WO id', extractWorkId('please implement WO-01a1-2 now') === '01a1-2');
check('extract plain', extractWorkId('context for PLAN-03b') === '03b');
check('no id → null', extractWorkId('just chatting, no ids here') === null);
check('ignore lowercase', extractWorkId('the wo-01 thing') === null);
// 도메인 화이트리스트 대조 — 기술 토큰이 작업 ID로 오인되면 안 된다
check('UTF-8 → null', extractWorkId('save as UTF-8 encoding') === null);
check('SHA-256 → null', extractWorkId('verify the SHA-256 digest') === null);
check('무효 도메인 건너뛰고 유효 ID 추출', extractWorkId('SHA-256 hash for WO-01a1-2') === '01a1-2');

// --- decideEdit: 파일명 도메인 화이트리스트 — 일반 파일명이 노드로 오인되면 안 된다 ---
const IDX3 = [{ domain: 'PLAN', id: '8', file: '.union-stack/plan/PLAN-8_x.md', status: 'Verifying' }];
check('UTF-8_notes.md 는 ZFS 노드 아님(blast-radius 미발동)',
  decideEdit('docs/UTF-8_notes.md', IDX3, 'warn', root).block === false);
check('진짜 노드는 여전히 잠금 검사', decideEdit('.union-stack/plan/PLAN-8_x.md', IDX3, 'warn', root).block === true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
