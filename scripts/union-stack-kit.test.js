// scripts/union-stack-kit.test.js
// 키트([PRO-24] ①(a)) 순수 계획 + 오프라인(--from-dir) 실행: 첫 실행 dry-run 무쓰기 · 없는 키트 파일만 가져옴 · 앵커는 동일 파일만. 실행: node scripts/union-stack-kit.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { gitBlobSha, blobShas, planKit, anchorLabel, parseVersion, KIT_FILES, ANCHOR, MANIFEST } = require('./union-stack-kit');
const tu = require('./template-update');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

// --- 순수: 해시는 template-update 와 동일(한 로직의 복제본 — 의존 0 조건) ---
check('gitBlobSha == template-update.gitBlobSha', gitBlobSha('test\n') === tu.gitBlobSha('test\n') && gitBlobSha('a\r\nb') === tu.gitBlobSha('a\r\nb'));
check('blobShas: LF·CRLF 후보', blobShas('x\r\n').includes(gitBlobSha('x\n')) && blobShas('x\n').includes(gitBlobSha('x\r\n')));
check('anchorLabel', anchorLabel('6.0.0') === 'clone@6.0.0(추정)' && anchorLabel(null) === 'clone@?(추정)');
check('parseVersion', parseVersion('# C\n## [Unreleased]\n## [6.0.0]\n') === '6.0.0');

// --- planKit ---
const up = { 'scripts/template-update.js': 'T', 'scripts/fs_walk.js': 'F', 'scripts/gate-contract.js': 'G', 'scripts/init.js': 'I', 'scripts/ledger.js': 'L', 'scripts/adapter.js': 'A', 'scripts/ship-manifest.js': 'S', [MANIFEST]: 'M', 'scripts/health.js': 'H2', 'scripts/zfs-linter.js': 'Z2', 'scripts/new.js': 'N' };
const guess = { 'scripts/health.js': 'H1', 'scripts/zfs-linter.js': 'Z1' };
const shipped = Object.keys(up);
const local = { 'scripts/fs_walk.js': ['F'], 'scripts/health.js': ['H1'], 'scripts/zfs-linter.js': ['Zlocal'] };
const p = planKit({ local, upstream: up, guess, shipped });
check('fetch: 없는 키트 파일 7(fs_walk 는 있음)', p.fetch.length === 7 && !p.fetch.includes('scripts/fs_walk.js') && p.keep.join() === 'scripts/fs_walk.js');
// 추정 지점(guess)과 동일한 파일의 앵커는 그 지점의 sha 다 — main sha(H2)를 적으면 로컬(H1) != 앵커 → localForked 오판(어답터 A 실측: 바이트 동일 8파일에 --force).
check('anchor: 상류와 동일(fs_walk) + 추정 지점과 동일(health → guess sha) + 가져온 파일', p.anchor['scripts/fs_walk.js'] === 'F' && p.anchor['scripts/health.js'] === 'H1' && p.anchor['scripts/template-update.js'] === 'T');
check('anchor: 추정 지점 sha 는 3-way 가 "clean" 으로 읽는다', require('./template-update').classifySyncTargets(['scripts/health.js'], { 'scripts/health.js': ['H1'] }, { 'scripts/health.js': p.anchor['scripts/health.js'] }).clean.length === 1);
check('unknown: 로컬이 다른 파일(zfs-linter)만 — 위조 정합 없음', JSON.stringify(p.unknown) === '["scripts/zfs-linter.js"]' && !('scripts/zfs-linter.js' in p.anchor));
check('missing: 배송 대상인데 없는 비키트 파일(new.js)', JSON.stringify(p.missing) === '["scripts/new.js"]');
check('guess 없이도 동작(health 는 unknown 이 된다)', planKit({ local, upstream: up, guess: null, shipped }).unknown.includes('scripts/health.js'));
check('KIT_FILES 8 · template-update 폐포', KIT_FILES.length === 8 && KIT_FILES.includes('scripts/init.js') && KIT_FILES.includes(MANIFEST));

// --- 오프라인 실행: 손 이식 어답터 흉내(상류 사본에서 키트 파일·앵커 삭제, 한 파일은 로컬 개조) ---
const ROOT = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-'));
try {
  const w = (rel, txt) => { const abs = path.join(tmp, rel); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, txt); };
  fs.mkdirSync(path.join(tmp, '.union-stack'), { recursive: true });
  w('scripts/fs_walk.js', fs.readFileSync(path.join(ROOT, 'scripts/fs_walk.js'), 'utf8'));          // 동일 → 앵커
  w('scripts/health.js', fs.readFileSync(path.join(ROOT, 'scripts/health.js'), 'utf8') + '\n// 로컬 패치\n'); // 다름 → unknown
  w('CHANGELOG.md', '# C\n\n## [6.0.0]\n- x\n');
  const kit = path.join(ROOT, 'scripts/union-stack-kit.js');
  const run = args => spawnSync(process.execPath, [kit, ...args, '--from-dir', ROOT], { cwd: tmp, encoding: 'utf8' });
  const snap = () => fs.readdirSync(path.join(tmp, 'scripts')).sort().join(',') + '|' + fs.existsSync(path.join(tmp, ANCHOR));
  const before = snap();
  const dry = run(['--json']);
  let j = null;
  try { j = JSON.parse(dry.stdout); } catch { /* null */ }
  check('dry-run: exit 0 · 계획만 · 쓰기 0', dry.status === 0 && !!j && j.applied === false && snap() === before);
  check('dry-run: 키트 7 가져올 계획 · fs_walk 유지 · health unknown', !!j && j.plan.fetch.length === 7 && j.plan.keep.includes('scripts/fs_walk.js') && j.plan.unknown.includes('scripts/health.js'));
  const ap = run(['--apply', '--json']);
  let a = null;
  try { a = JSON.parse(ap.stdout); } catch { /* null */ }
  check('apply: 키트 8 파일 실존 · 앵커 생성', ap.status === 0 && !!a && a.applied && KIT_FILES.every(f => fs.existsSync(path.join(tmp, f))) && fs.existsSync(path.join(tmp, ANCHOR)));
  const anchor = JSON.parse(fs.readFileSync(path.join(tmp, ANCHOR), 'utf8'));
  check('앵커: 추정 표기 + 동일·가져온 파일만(health 제외)', anchor.ref === 'clone@6.0.0(추정)' && 'scripts/fs_walk.js' in anchor.blobs && 'scripts/template-update.js' in anchor.blobs && !('scripts/health.js' in anchor.blobs));
  check('health 로컬 패치는 그대로(키트는 있는 파일을 안 건드린다)', fs.readFileSync(path.join(tmp, 'scripts/health.js'), 'utf8').includes('// 로컬 패치'));
  const again = run(['--apply', '--json']);
  check('재실행: 앵커가 있으면 그대로 둔다', again.status === 0 && JSON.parse(again.stdout).anchorExists === true);
  // 키트가 심은 앵커를 template-update 의 3-way 가 그대로 읽는다: fs_walk clean · health unknown
  const lf = tu.localTemplateFiles(tmp, { manifest: null, localOwned: [] });
  const g = tu.classifySyncTargets(['scripts/fs_walk.js', 'scripts/health.js'], lf, tu.readAnchor(tmp));
  check('template-update 3-way: 동일 파일 clean · 패치 파일 unknown(보호)', g.clean.includes('scripts/fs_walk.js') && g.unknown.includes('scripts/health.js'));
  const noPlane = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-noplane-'));
  check('.union-stack 없는 곳 → 3(어답터 아님)', spawnSync(process.execPath, [kit, '--from-dir', ROOT], { cwd: noPlane, encoding: 'utf8' }).status === 3);
  fs.rmSync(noPlane, { recursive: true, force: true });
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
