// scripts/ci.test.js
// 체인 정의(순수)와 선택 단계([PRO-24] ①(c)) — 상류 전용 스크립트가 없는 어답터에서 체인이 죽지 않는다. 실행: node scripts/ci.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chain, missingScript, receiptOf, OUTCOME } = require('./ci');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

const names = chain().map(s => s.name);
check('체인 순서: 싼 게이트 먼저 · weakening 은 permission 다음 · ship-manifest 는 test-catalog 다음', names.join(',') === 'zfs-linter,history-linter,permission-guard,weakening-guard,handoff-linter,test-catalog,ship-manifest,tests,health,adopter-arm');
check('차단 단계: zfs·history·weakening·tests·health·adopter-arm', chain().filter(s => s.blocking !== false).map(s => s.name).join(',') === 'zfs-linter,history-linter,weakening-guard,tests,health,adopter-arm');
check('--range 는 permission·weakening 에 전달', chain({ range: 'A..B' }).filter(s => s.args.includes('--range')).map(s => s.name).join(',') === 'permission-guard,weakening-guard');
check('[PRO-11] 4값 + UNKNOWN 외', OUTCOME[0] === 'PASS' && OUTCOME[1] === 'REJECT' && OUTCOME[3] === 'CLARIFY' && OUTCOME[4] === 'HOLD');

// 선택 단계: 스크립트 부재 → 건너뜀(상류 전용 미배송). --test 단계는 파일 검사 대상이 아니다.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-opt-'));
try {
  fs.mkdirSync(path.join(tmp, 'scripts'));
  fs.writeFileSync(path.join(tmp, 'scripts/health.js'), '// x\n');
  check('있는 스크립트는 건너뛰지 않는다', missingScript({ name: 'health', args: ['scripts/health.js'] }, tmp) === false);
  check('없는 스크립트(adopter-arm)는 건너뛴다', missingScript({ name: 'adopter-arm', args: ['scripts/adopter-arm.js'] }, tmp) === true);
  check('--test 단계는 파일 검사 아님', missingScript({ name: 'tests', args: ['--test', 'scripts/a.test.js'] }, tmp) === false);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
// 상류 전용 단계(adopter-arm)는 어답터에 없는 것이 정상 — 실존 단언은 템플릿 모드에서만([ADR-30]).
if (require('./adapter').isTemplateRepo()) check('상류 자신: 체인 스크립트 전부 실존', chain().every(s => !missingScript(s)));
else console.log('(어답터: 체인 스크립트 실존 단언 건너뜀 — 없는 단계는 건너뛴다)');

// 영수증 줄(하네스 단계): tests 는 targets 를 읽고, 다른 단계는 비움
const git = { sha: 'abc1234', dirty: false };
const rc = receiptOf({ scope: 'harness', name: 'tests', args: '--test x', code: 0, outcome: 'PASS', durMs: 10, stdout: '# tests 46\n# pass 44\n# fail 2\n' }, git, 'ci.js@6.0.0', '2026-10-17');
check('tests 단계 영수증: targets 46 passed 44 failed 2', / scope=harness name=tests exit=0 outcome=PASS targets=46 passed=44 failed=2 /.test(rc));
check('다른 하네스 단계는 targets 비움', / targets=- /.test(receiptOf({ scope: 'harness', name: 'health', args: 'scripts/health.js', code: 0, outcome: 'PASS', durMs: 5, stdout: '' }, git, 'ci.js@6.0.0', '2026-10-17')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
