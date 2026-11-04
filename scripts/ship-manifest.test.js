// scripts/ship-manifest.test.js
// 배송 매니페스트([PRO-24] ①(c)) 순수 로직: 태그 파싱(선두만) · 테스트 짝 상속 · 매니페스트 왕복 · 드리프트 CLI. 실행: node scripts/ship-manifest.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseTag, build, render, parseManifest, scan, MANIFEST, CONTRACT } = require('./ship-manifest');
const { validateContract } = require('./gate-contract');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

check('계약 선언 완전 · REJECT 없음', validateContract(CONTRACT).length === 0 && !CONTRACT.outcomes.includes('REJECT'));

// --- parseTag: 선두 주석 블록만, 본문 문자열 속 언급은 태그가 아니다([ADR-19]) ---
check('upstream-only 태그 + 이유', JSON.stringify(parseTag('// scripts/x.js\n// @ship upstream-only — 평가 계층\nconst a = 1;')) === '{"kind":"upstream-only","reason":"평가 계층"}');
check('optional 태그', parseTag('// x\n// @ship optional: 어답터 선택\n').kind === 'optional');
check('태그 없음', parseTag('// x\nconst s = "// @ship upstream-only";\n').kind === null || parseTag('// x\n'.repeat(13) + '// @ship upstream-only\n').kind === null);
check('13줄 밖의 태그는 무시', parseTag('// a\n'.repeat(12) + '// @ship upstream-only\n').kind === null);

// --- build: 테스트 짝 상속 · 매니페스트 자신 포함 ---
const files = ['scripts/eval.js', 'scripts/eval.test.js', 'scripts/health.js', 'scripts/health.test.js', 'scripts/dashboard.js', 'scripts/ship-manifest.js', 'scripts/sub/x.js', 'scripts/notes.md'];
const m = build(files, { 'scripts/eval.js': 'upstream-only', 'scripts/dashboard.js': 'optional', 'scripts/health.js': null });
check('상류 전용 + 그 테스트', JSON.stringify(m.upstreamOnly) === '["scripts/eval.js","scripts/eval.test.js"]');
check('배송에는 상류 전용이 없다 · 매니페스트 자신 포함 · 하위 디렉터리·비-js 제외', !m.shipped.includes('scripts/eval.js') && !m.shipped.includes('scripts/eval.test.js') && m.shipped.includes(MANIFEST) && !m.shipped.some(f => f.includes('/sub/') || f.endsWith('.md')));
check('optional 은 배송에 포함되고 따로도 열거', m.shipped.includes('scripts/dashboard.js') && JSON.stringify(m.optional) === '["scripts/dashboard.js"]');
check('왕복: render → parseManifest', JSON.stringify(parseManifest(render(m)).upstreamOnly) === JSON.stringify(m.upstreamOnly));
check('깨진 매니페스트는 null(규칙 폴백)', parseManifest('{ nope') === null && parseManifest('{"x":1}') === null);

// --- scan(상류): 상류 전용 9+1 이 전부 태그돼 있고 테스트가 따라간다 — 상류 트리 의존이라 템플릿 모드에서만([ADR-30]) ---
if (require('./adapter').isTemplateRepo()) {
  const up = scan(path.resolve(__dirname, '..'));
  const expectUpstreamOnly = ['eval', 'eval-arm', 'fetch-eval', 'scenario-rubric', 'token-accounting', 'hook-replay', 'check-prereqs', 'adopter-arm', 'e6-workspace', 'adopter-census'];
  check('상류 전용 10종 태그', expectUpstreamOnly.every(n => up.upstreamOnly.includes(`scripts/${n}.js`)));
  check('상류 전용의 테스트도 상류 전용', up.upstreamOnly.includes('scripts/adopter-arm.test.js') && !up.shipped.includes('scripts/eval.test.js'));
  check('핵심 도구는 배송', ['scripts/health.js', 'scripts/zfs-linter.js', 'scripts/template-update.js', 'scripts/work-close.js', 'scripts/upward-fetch.js', MANIFEST].every(f => up.shipped.includes(f)));
} else console.log('(어답터: 상류 트리 태그 검사 건너뜀 — 어답터의 scan 은 자기 스크립트를 본다)');

// --- CLI: 임시 루트에서 부재 → CLARIFY · --write → PASS · 재검사 PASS · 태그 바꾸면 드리프트 ---
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-'));
try {
  fs.mkdirSync(path.join(tmp, 'scripts'));
  fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'union-stack' })); // 템플릿 모드(드리프트 검사는 상류 몫)
  fs.writeFileSync(path.join(tmp, 'scripts/a.js'), '// a\n');
  fs.writeFileSync(path.join(tmp, 'scripts/b.js'), '// b\n// @ship upstream-only — x\n');
  const cli = args => spawnSync(process.execPath, [path.resolve(__dirname, 'ship-manifest.js'), ...args], { cwd: tmp, encoding: 'utf8' });
  // run 의 root 는 __dirname 기준이라 CLI 는 상류를 본다 — 임시 루트 검사는 모듈 함수로.
  const { run } = require('./ship-manifest');
  const silent = (fn) => { const c = console.log, e = console.error; console.log = () => {}; console.error = () => {}; try { return fn(); } finally { console.log = c; console.error = e; } };
  check('부재 → CLARIFY(3)', silent(() => run([], tmp)) === 3);
  check('--write → PASS + 파일', silent(() => run(['--write'], tmp)) === 0 && fs.existsSync(path.join(tmp, MANIFEST)));
  check('재검사 PASS', silent(() => run([], tmp)) === 0);
  fs.writeFileSync(path.join(tmp, 'scripts/a.js'), '// a\n// @ship upstream-only — now\n');
  check('태그 변경 → 드리프트 CLARIFY', silent(() => run([], tmp)) === 3);
  check('CLI 바이너리는 상류를 본다(동기화 상태)', [0, 3].includes(cli([]).status));
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

// --- 어답터 모드: 매니페스트는 상류 소유 — 자기 스캔과 비교하지 않고 INFO PASS(카나리아 실측: 영구 드리프트 소음) ---
const tmpA = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-adopter-'));
try {
  fs.mkdirSync(path.join(tmpA, 'scripts'));
  fs.writeFileSync(path.join(tmpA, 'package.json'), JSON.stringify({ name: 'probe-adopter' }));
  fs.writeFileSync(path.join(tmpA, 'scripts/their-tool.js'), '// theirs\n');
  const { run: runA } = require('./ship-manifest');
  const quiet = (fn) => { const c = console.log, e = console.error; console.log = () => {}; console.error = () => {}; try { return fn(); } finally { console.log = c; console.error = e; } };
  check('어답터: 매니페스트 없어도 PASS(상류가 배송)', quiet(() => runA([], tmpA)) === 0);
  fs.writeFileSync(path.join(tmpA, MANIFEST), render(build(['scripts/health.js'], {})));
  check('어답터: 자기 스캔과 달라도 PASS(드리프트는 상류 몫)', quiet(() => runA([], tmpA)) === 0);
} finally { fs.rmSync(tmpA, { recursive: true, force: true }); }

// --- 배송 파일 → 상류 전용 모듈 require 누설(어답터 A 실측: lineage-tree.test 가 fetch-eval 을 require → MODULE_NOT_FOUND) ---
// 열 0 의 무조건 require 만 누설이다. try 안의 조건부 require 는 어답터에서 부재를 감수하는 명시적 선택이라 제외.
const { requireLeaks, topLevelRequires } = require('./ship-manifest');
check('topLevelRequires: 열 0 const/let/bare 만 · ./ 상대 · .js 유무 무관',
  JSON.stringify(topLevelRequires("const { a } = require('./x');\nlet b = require('./y.js');\nrequire('./z');\n  const c = require('./deep');\ntry { d = require('./cond'); } catch {}\nconst fs = require('fs');\n"))
  === JSON.stringify(['scripts/x.js', 'scripts/y.js', 'scripts/z.js']));
const tmpL = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-leak-'));
try {
  fs.mkdirSync(path.join(tmpL, 'scripts'));
  fs.writeFileSync(path.join(tmpL, 'package.json'), JSON.stringify({ name: 'union-stack' }));
  fs.writeFileSync(path.join(tmpL, 'scripts/a.js'), "const { x } = require('./b');\nconst y = require('./c');\n");
  fs.writeFileSync(path.join(tmpL, 'scripts/a.test.js'), "let z = null; try { ({ z } = require('./b')); } catch {}\n");
  fs.writeFileSync(path.join(tmpL, 'scripts/b.js'), '// @ship upstream-only — x\n');
  fs.writeFileSync(path.join(tmpL, 'scripts/c.js'), '// c\n');
  const { run: runL, scan: scanL } = require('./ship-manifest');
  const hush = (fn) => { const c = console.log, e = console.error; console.log = () => {}; console.error = () => {}; try { return fn(); } finally { console.log = c; console.error = e; } };
  check('requireLeaks: 배송 a.js → 상류 전용 b.js 1건(조건부 require 의 a.test.js 는 제외 · 배송 c.js 는 제외)',
    JSON.stringify(requireLeaks(tmpL, scanL(tmpL))) === JSON.stringify([{ file: 'scripts/a.js', dep: 'scripts/b.js' }]));
  check('누설 있어도 --write 는 생성(PASS)', hush(() => runL(['--write'], tmpL)) === 0);
  check('누설 → 검사 CLARIFY(3)', hush(() => runL([], tmpL)) === 3);
  fs.writeFileSync(path.join(tmpL, 'scripts/a.js'), "let x = null; try { ({ x } = require('./b')); } catch {}\nconst y = require('./c');\n");
  check('조건부로 바꾸면 PASS', hush(() => runL([], tmpL)) === 0);
} finally { fs.rmSync(tmpL, { recursive: true, force: true }); }
// 상류 자신: 배송 파일은 상류 전용을 무조건 require 하지 않는다(템플릿 모드에서만 — 어답터 트리에는 상류 전용이 없다).
if (require('./adapter').isTemplateRepo()) check('상류 배송 파일의 상류 전용 require 누설 0', requireLeaks(path.resolve(__dirname, '..'), scan(path.resolve(__dirname, '..'))).length === 0);

// --- 심볼 수준 의존(어답터 A 실측: 경로만 보면 41쌍, 실제 심볼 불일치 1쌍) ---
const { requireSymbols, exportKeys } = require('./ship-manifest');
check('requireSymbols: 구조 분해 심볼(별칭은 export 키) · 기본 require 는 null · 중복 모듈 병합',
  JSON.stringify(requireSymbols("const { a, b: bb } = require('./x');\nconst y = require('./y');\nconst { c } = require('./x.js');\nrequire('./z');\n"))
  === JSON.stringify([{ dep: 'scripts/x.js', symbols: ['a', 'b', 'c'] }, { dep: 'scripts/y.js', symbols: null }, { dep: 'scripts/z.js', symbols: null }]));
check('exportKeys: module.exports 객체 키(단축·별칭) + exports.k 대입 · 스프레드 무시',
  JSON.stringify([...exportKeys("module.exports = { analyze, run: runCli, ...rest, CONTRACT };\nmodule.exports.extra = 1;\nexports.more = 2;\n")]) === JSON.stringify(['analyze', 'run', 'CONTRACT', 'extra', 'more']));
check('exportKeys: module.exports 없음 → null', exportKeys('const a = 1;\n') === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
