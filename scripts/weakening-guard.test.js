// scripts/weakening-guard.test.js
// 순수 로직([PRO-22] §3 단계 3·4): diff 파싱 · 신호 6종 · 예외 증가 red · known_failures 덮기/만료 · 사유 면제. 실행: node scripts/weakening-guard.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseUnifiedDiff, analyze, numericChanges, snapshotFields, evaluateKnownFailures, verdict, weakeningReasons, CONTRACT } = require('./weakening-guard');
const { validateContract } = require('./gate-contract');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

check('계약 선언 완전', validateContract(CONTRACT).length === 0);

const DIFF = [
  'diff --git a/src/a.test.js b/src/a.test.js', 'deleted file mode 100644', 'index 1..0', '--- a/src/a.test.js', '+++ /dev/null', '@@ -1,3 +0,0 @@',
  "-test('x', () => { expect(1).toBe(1); });", "-test('y', () => { expect(2).toBe(2); });",
  'diff --git a/src/b.test.js b/src/b.test.js', 'index 1..2', '--- a/src/b.test.js', '+++ b/src/b.test.js', '@@ -1,4 +1,3 @@',
  "-test('slow', () => {", '-  expect(r).toBeGreaterThan(80);', '-  expect(q).toBe(1);', '-});',
  "+test.skip('slow', () => {", '+  expect(r).toBeGreaterThan(60);', '+});',
  'diff --git a/src/__snapshots__/c.snap b/src/__snapshots__/c.snap', 'index 1..2', '--- a/x', '+++ b/x', '@@ -1,2 +1,2 @@',
  '-  "price": 10,', '+  "price": 12,', '-  "currency": "USD",', '+  "currency": "EUR",',
  'diff --git a/jest.config.js b/jest.config.js', 'index 1..2', '--- a/x', '+++ b/x', '@@ -1 +1 @@',
  "-  testMatch: ['**/*.test.js'],", "+  testMatch: ['**/unit/*.test.js'], passWithNoTests: true,",
  'diff --git a/src/svc.js b/src/svc.js', 'index 1..2', '--- a/x', '+++ b/x', '@@ -1 +1,2 @@',
  '+// eslint-disable-next-line no-unused-vars', '+// @ts-ignore KF-7 legacy typing',
].join('\n');

const files = parseUnifiedDiff(DIFF);
check('diff 파싱: 파일 5 · 상태', files.length === 5 && files[0].status === 'D' && files[1].status === 'M' && files[1].added.length === 3 && files[1].removed.length === 4);
check('산문 속 noqa 는 예외가 아니다(마커 꼴만)', analyze(parseUnifiedDiff("diff --git a/a.js b/a.js\nindex 1..2\n--- a/x\n+++ b/x\n@@ -1 +1,2 @@\n+// skip 과 noqa 를 검사한다\n+x = 1  # noqa\n")).exceptions.net === 1);
// 자기언급 오염([ADR-19]): 따옴표 안의 마커는 세지 않는다 — 이 가드의 테스트·팔 픽스처가 가드를 울리면 안 된다.
const quoted = analyze(parseUnifiedDiff("diff --git a/x.test.js b/x.test.js\nindex 1..2\n--- a/x\n+++ b/x\n@@ -1 +1,2 @@\n+const FIX = \"+test.skip('a')\";\n+const E = '// eslint-disable-next-line';\n"));
check('문자열 안의 skip·disable 은 신호·예외가 아니다', quoted.signals.length === 0 && quoted.exceptions.net === 0);
check('문자열 밖의 마커는 센다', analyze(parseUnifiedDiff("diff --git a/x.test.js b/x.test.js\nindex 1..2\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n+test.skip('a', () => {});\n")).exceptions.net === 1);
const an = analyze(files);
const kinds = an.signals.map(s => s.kind);
check('신호: 테스트 삭제', kinds.includes('test-deleted'));
check('신호: skip 추가', kinds.includes('skip-added'));
check('신호: 단언 순감', kinds.includes('assert-decrease'));
check('신호: 숫자 리터럴 변경(80→60)', an.signals.find(s => s.kind === 'numeric-change').question.includes('80→60'));
check('신호: 스냅샷은 필드 종류로 묻는다(price·currency)', /price·currency|currency·price/.test(an.signals.find(s => s.kind === 'snapshot-updated').question));
check('신호: 러너 설정(testMatch·passWithNoTests)', kinds.includes('runner-config'));
check('예외 순증: skip 1 + disable 1 + ts-ignore 1 = 3', an.exceptions.net === 3 && an.exceptions.where.length === 2);
check('질문은 한 줄씩', an.signals.every(s => !s.question.includes('\n') && s.question.endsWith('?')));

// --- 판정: 단계 4 ⓑ 예외 증가 → REJECT · known_failures 가 덮으면 통과(CLARIFY 는 남는다) · 만료 → REJECT ---
const noKf = evaluateKnownFailures([], files);
check('예외 증가 + 덮기 0 → REJECT', verdict(an, noKf).outcome === 'REJECT' && verdict(an, noKf).issues.some(i => i.includes('+3')));
const today = new Date('2026-10-16T12:00:00');
const kf = evaluateKnownFailures([{ name: 'unit', known_failures: [
  { id: 'KF-7', reason: 'legacy typing', owner: 'me', until: '2026-12-31' },
  { id: 'KF-9', reason: 'not in diff', owner: 'me', until: '2026-12-31' },
  { id: 'KF-old', reason: 'expired', owner: 'me', until: '2026-01-01' },
  { id: 'KF-bad', reason: 'no until', owner: 'me' },
] }], files, today);
check('known_failures: 활성 2 · 추가 줄에 보이는 것만 덮는다(KF-7)', kf.active.length === 2 && kf.covering === 1 && kf.active.find(e => e.id === 'KF-9').covers === false);
check('known_failures: 만료 1 · 형식 오류 1', kf.expired.length === 1 && kf.malformed.length === 1);
const vExp = verdict(an, kf);
check('만료가 있으면 REJECT(사유에 id·owner)', vExp.outcome === 'REJECT' && vExp.issues.some(i => i.includes('KF-old') && i.includes('owner me')));
const kfOk = evaluateKnownFailures([{ name: 'unit', known_failures: [{ id: 'KF-7', reason: 'x', owner: 'me', until: '2026-12-31' }] }], files, today);
const an1 = { ...an, exceptions: { ...an.exceptions, net: 1, where: ['src/svc.js +1'] } };
check('순증이 known_failures 로 전부 덮이면 REJECT 아님 → 약화 신호는 CLARIFY', verdict(an1, kfOk).outcome === 'CLARIFY' && verdict(an1, kfOk).questions.length === an.signals.length);
check('약화 신호 + WO 사유 → PASS(INFO)', verdict(an1, kfOk, ['WO-01a-1: 레거시 테스트 대체']).outcome === 'PASS' && /사유 있음/.test(verdict(an1, kfOk, ['x']).info));
check('신호 0 · 예외 0 → PASS', verdict({ signals: [], exceptions: { net: 0, where: [], added: 0, removed: 0 } }, noKf).outcome === 'PASS');
check('약화 신호는 절대 차단하지 않는다', verdict({ signals: an.signals, exceptions: { net: 0, where: [], added: 0, removed: 0 } }, noKf).outcome === 'CLARIFY');
check('weakening: 사유 추출', JSON.stringify(weakeningReasons([{ id: '01a-1', evidence: '테스트 12/12 · weakening: 레거시 대체 · rcpt:n/a' }, { id: '02', evidence: 'none' }])) === '["WO-01a-1: 레거시 대체"]');
check('numericChanges: 숫자만 다른 줄 쌍', numericChanges({ added: ['expect(x).toBe(3)', 'other'], removed: ['expect(x).toBe(5)'] })[0].from === '5');
check('snapshotFields: 키 추출', JSON.stringify(snapshotFields({ added: ['  "a": 1', 'b: 2'], removed: ['  "a": 0'] })) === '["a","b"]');

// --- CLI: --diff 파일 · 종료코드 3/1/0 ---
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'weak-'));
try {
  const dfile = path.join(tmp, 'd.diff');
  fs.writeFileSync(dfile, DIFF);
  const cwd = path.resolve(__dirname, '..');
  const r = spawnSync(process.execPath, ['scripts/weakening-guard.js', '--diff', dfile, '--json'], { cwd, encoding: 'utf8' });
  check('CLI(--diff): 예외 증가 → exit 1(REJECT)', r.status === 1 && JSON.parse(r.stdout).outcome === 'REJECT');
  fs.writeFileSync(dfile, DIFF.split('\n').filter(l => !/eslint-disable|@ts-ignore/.test(l)).join('\n').replace("+test.skip('slow'", "+test('slow'"));
  const r2 = spawnSync(process.execPath, ['scripts/weakening-guard.js', '--diff', dfile], { cwd, encoding: 'utf8' });
  check('CLI(--diff): 약화 신호만 → exit 3(CLARIFY) + 질문', r2.status === 3 && /\? /.test(r2.stderr));
  fs.writeFileSync(dfile, 'diff --git a/README.md b/README.md\nindex 1..2\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n');
  const r3 = spawnSync(process.execPath, ['scripts/weakening-guard.js', '--diff', dfile], { cwd, encoding: 'utf8' });
  check('CLI(--diff): 무관한 diff → exit 0', r3.status === 0);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
