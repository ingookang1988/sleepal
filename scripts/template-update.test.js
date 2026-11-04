// scripts/template-update.test.js
// 순수 함수 단위 테스트(네트워크 없음 — hermetic). 실행: node scripts/template-update.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { classifyPath, parseChangelogVersion, cmpVersions, gitBlobSha, gitBlobShas, buildPlan,
  classifySyncTargets, readAnchor, seedAnchor, migrationActions, ANCHOR_PATH } = require('./template-update');

let pass = 0, fail = 0;
function check(label, got, exp) {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  if (ok) pass++; else { fail++; console.error(`FAIL ${label}: got ${JSON.stringify(got)}, exp ${JSON.stringify(exp)}`); }
}

// --- classifyPath: sync / review / 불가침 ---
check('scripts → sync', classifyPath('scripts/health.js'), 'sync');
check('workflow → sync', classifyPath('.github/workflows/harness.yml'), 'sync');
check('CHANGELOG → sync', classifyPath('CHANGELOG.md'), 'sync');
check('AGENTS → review(규범)', classifyPath('AGENTS.md'), 'review');
check('가이드 → review', classifyPath('.union-stack/sprint/_GUIDE.md'), 'review');
check('어답터 콘텐츠 → 불가침', classifyPath('.union-stack/sprint/HANDOFF.md'), null);
check('어답터 원장 → 불가침', classifyPath('.union-stack/archive_ledger.md'), null);
check('어답터 소스 → 불가침', classifyPath('src/app.js'), null);
check('어답터 설정 → 불가침(상류 불간섭)', classifyPath('.union-stack/adapter.json'), null);
check('정합 앵커 매니페스트 → 불가침', classifyPath(ANCHOR_PATH), null);
check('스크립트 하위 디렉터리 → 불가침(1레벨만)', classifyPath('scripts/vendor/x.js'), null);

// --- parseChangelogVersion: Unreleased 건너뛰고 첫 릴리스 헤딩 ---
const CL = `# Changelog\n\n## [Unreleased]\n- foo\n\n## [6.1.0] — 2026-09-01\n- ⚠ tier 필드 도입 — 게이트 재실행 필요\n- 기타\n\n## [6.0.0] — 2026-06-15\n- ⚠ eval 표면 추가\n`;
check('최신 릴리스 버전', parseChangelogVersion(CL), '6.1.0');
check('헤딩 없음 → null', parseChangelogVersion('그냥 텍스트'), null);

// --- cmpVersions ---
check('동일', cmpVersions('6.0.0', '6.0.0'), 0);
check('로컬 구버전', cmpVersions('6.0.0', '6.1.0'), -1);
check('로컬 앞섬', cmpVersions('6.10.0', '6.9.9'), 1);
check('세그먼트 수 상이', cmpVersions('6.0', '6.0.1'), -1);

// --- gitBlobSha(s): git hash-object와 동일 + 개행 이형 흡수(양방향) ---
check('known blob sha ("test\\n")', gitBlobSha('test\n'), '9daeafb9864cf43055ae93beb0afd6c7d144bfa4');
check('LF 파일 → LF 후보 포함(+CRLF 변형)', gitBlobShas('test\n').includes('9daeafb9864cf43055ae93beb0afd6c7d144bfa4'), true);
check('CRLF 파일 → 원본+정규화 2후보(상류가 CRLF 블롭이든 LF 블롭이든 일치)',
  gitBlobShas('test\r\n').includes(gitBlobSha('test\r\n')) && gitBlobShas('test\r\n').includes('9daeafb9864cf43055ae93beb0afd6c7d144bfa4'), true);
check('개행만 다른 로컬 CRLF vs 상류 LF 블롭 → 드리프트 아님',
  buildPlan({ 'scripts/health.js': gitBlobShas('x\r\n') }, { 'scripts/health.js': gitBlobSha('x\n') }).changedSync, []);
check('개행만 다른 로컬 LF vs 상류 CRLF 블롭 → 드리프트 아님(harness.yml 실측 사례)',
  buildPlan({ 'scripts/health.js': gitBlobShas('x\n') }, { 'scripts/health.js': gitBlobSha('x\r\n') }).changedSync, []);

// --- buildPlan ---
const local = { 'scripts/health.js': 'aaa', 'AGENTS.md': 'ccc', 'scripts/gone.js': 'x', '.union-stack/sprint/HANDOFF.md': 'zzz' };
const upstream = {
  'scripts/health.js': 'bbb',            // 변경(sync)
  'AGENTS.md': 'ddd',                    // 변경(review)
  'scripts/new-tool.js': 'e',            // 신규(sync)
  'scripts/leakage-guard.js': 'f',       // TEMPLATE_BITS — 로컬 부재 시 재추가 금지
  '.union-stack/sprint/HANDOFF.md': 'q', // 불가침 — 계획에 안 들어감
  'src/theirs.js': 'r',                  // 템플릿 소유 아님
};
const plan = buildPlan(local, upstream);
check('변경 sync', plan.changedSync, ['scripts/health.js']);
check('변경 review', plan.changedReview, ['AGENTS.md']);
check('신규 sync', plan.newSync, ['scripts/new-tool.js']);
check('drop된 템플릿 비트 재추가 금지', plan.dropped, ['scripts/leakage-guard.js']);
check('상류에서 사라진 파일', plan.removedUpstream, ['scripts/gone.js']);
check('불가침 콘텐츠는 어떤 목록에도 없음',
  JSON.stringify(plan).includes('HANDOFF'), false);

// --- classifySyncTargets: 3-way 로컬 개조 보호 ---
// 실측 사고: sync 파일에 반복 재적용 중이던 로컬 패치 2건을 `--apply` 가 조용히 덮어써
// 게이트 2개가 즉시 FAIL 했다. 앵커와 대조해 개조를 골라내는 것이 그 사고의 회귀 고정이다.
const A = gitBlobSha('anchor content\n');
const localFiles = {
  'scripts/health.js': gitBlobShas('anchor content\n'),   // 손대지 않음 → clean
  'scripts/zfs-linter.js': gitBlobShas('local patch\n'),  // 개조 → modified
  'scripts/query.js': gitBlobShas('whatever\n'),          // 앵커에 없음 → unknown
};
const anchor = { 'scripts/health.js': A, 'scripts/zfs-linter.js': A };
const g = classifySyncTargets(
  ['scripts/health.js', 'scripts/zfs-linter.js', 'scripts/query.js', 'scripts/brand-new.js'],
  localFiles, anchor);
check('앵커와 같으면 clean', g.clean.includes('scripts/health.js'), true);
check('앵커와 다르면 modified(개조 보존 대상)', g.modified, ['scripts/zfs-linter.js']);
check('앵커 없으면 unknown(통과로 위조 금지)', g.unknown, ['scripts/query.js']);
check('로컬에 없는 상류 신규는 clean(잃을 것이 없다)', g.clean.includes('scripts/brand-new.js'), true);
check('세 목록은 서로소 + 전수', g.clean.length + g.modified.length + g.unknown.length, 4);
check('앵커 전무 → 전부 unknown(첫 --apply 가 조용히 덮어쓰지 않는다)',
  classifySyncTargets(['scripts/health.js'], localFiles, {}).unknown, ['scripts/health.js']);
// 앵커가 배열(init 시딩)이든 문자열(--apply 기록)이든 같은 판정이어야 한다.
check('배열 앵커도 동일 판정',
  classifySyncTargets(['scripts/health.js'], localFiles, { 'scripts/health.js': gitBlobShas('anchor content\n') }).clean,
  ['scripts/health.js']);
check('개행만 다른 로컬은 개조가 아니다',
  classifySyncTargets(['x'], { x: gitBlobShas('anchor content\r\n') }, { x: A }).clean, ['x']);

// --- readAnchor / seedAnchor: 매니페스트 왕복 ---
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tu-'));
check('앵커 파일 없음 → 빈 앵커(예외 아님)', readAnchor(tmp), {});
fs.mkdirSync(path.join(tmp, '.union-stack'), { recursive: true });
fs.writeFileSync(path.join(tmp, ANCHOR_PATH), '{ broken json');
check('깨진 앵커 → 빈 앵커(도구가 죽지 않는다)', readAnchor(tmp), {});
fs.mkdirSync(path.join(tmp, 'scripts'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'scripts/health.js'), 'seeded\n');
seedAnchor(tmp, 'clone@6.0.0');
const seeded = readAnchor(tmp);
check('시딩된 앵커가 로컬 해시를 담는다',
  (seeded['scripts/health.js'] || []).includes(gitBlobSha('seeded\n')), true);
check('시딩 직후에는 개조 0(클론 == 상류)',
  classifySyncTargets(['scripts/health.js'], { 'scripts/health.js': gitBlobShas('seeded\n') }, seeded).modified, []);
fs.writeFileSync(path.join(tmp, 'scripts/health.js'), 'seeded\n// 어답터 패치\n');
check('시딩 후 손대면 modified 로 잡힌다',
  classifySyncTargets(['scripts/health.js'], { 'scripts/health.js': gitBlobShas('seeded\n// 어답터 패치\n') }, seeded).modified,
  ['scripts/health.js']);
fs.rmSync(tmp, { recursive: true, force: true });

// --- migrationActions: (from, to] 구간의 ⚠ 줄만 ---
check('구간 내 ⚠ 추출', migrationActions(CL, '6.0.0', '6.1.0'), ['- ⚠ tier 필드 도입 — 게이트 재실행 필요']);
check('from 버전 자체는 제외', migrationActions(CL, '6.0.0', '6.0.0'), []);
check('from 없음(신규 채택) → 전 구간', migrationActions(CL, null, '6.1.0').length, 2);
check('Unreleased는 제외', migrationActions(CL, '6.1.0', '6.1.0'), []);

// --- [PRO-24] ①(b)(c) 글롭 · ctx 분류 · 매니페스트 화이트리스트 · buildPlan ctx ---
const { matchGlob, ownedConflicts } = require('./template-update');
check('glob: * 는 구간 안', [matchGlob('scripts/*-linter.js', 'scripts/zfs-linter.js'), matchGlob('scripts/*-linter.js', 'scripts/sub/x-linter.js')], [true, false]);
check('glob: ** 는 횡단 · ? 한 글자 · 역슬래시 정규화', [matchGlob('scripts/docker-ci/**', 'scripts/docker-ci/a/b.sh'), matchGlob('scripts/v?.js', 'scripts/v1.js'), matchGlob('scripts\\verify.sh', 'scripts/verify.sh')], [true, true, true]);
check('glob: 점은 리터럴', matchGlob('scripts/verify.sh', 'scripts/verifyXsh'), false);
const MF = { shipped: ['scripts/health.js', 'scripts/zfs-linter.js', 'scripts/ship-manifest.json'], upstreamOnly: ['scripts/eval.js', 'scripts/adopter-arm.js'], optional: [] };
const CTX = { manifest: MF, localOwned: ['scripts/verify.sh', 'scripts/*-linter.js'] };
check('ctx 없음 = 규칙 폴백(구버전)', classifyPath('scripts/eval.js'), 'sync');
check('상류 전용 → null(배송 제외)', classifyPath('scripts/eval.js', CTX), null);
check('매니페스트 밖 로컬 스크립트 → null(기본 로컬)', classifyPath('scripts/their-tool.js', CTX), null);
check('열거된 파일 → sync', classifyPath('scripts/health.js', CTX), 'sync');
check('localOwned 글롭 → null(어답터 소유)', classifyPath('scripts/verify.sh', CTX), null);
check('글롭이 열거 파일과 겹치면 sync 우선', classifyPath('scripts/zfs-linter.js', CTX), 'sync');
check('충돌 목록', ownedConflicts(MF, CTX.localOwned), ['scripts/zfs-linter.js']);
check('비스크립트는 규칙대로(글롭 없으면)', [classifyPath('AGENTS.md', CTX), classifyPath('ci/Dockerfile', CTX)], ['review', 'sync']);
const localCtxT = { manifest: { shipped: ['scripts/health.js', 'scripts/ship-manifest.json'], upstreamOnly: ['scripts/eval.js'], optional: [] }, localOwned: ['scripts/verify.sh'] };
const upCtxT = { manifest: { shipped: ['scripts/health.js', 'scripts/new-tool.js', 'scripts/ship-manifest.json'], upstreamOnly: ['scripts/eval.js', 'scripts/adopter-arm.js'], optional: [] }, localOwned: ['scripts/verify.sh'] };
const planC = buildPlan(
  { 'scripts/health.js': 'a', 'scripts/eval.js': 'e', 'scripts/verify.sh': 'v', 'scripts/their-tool.js': 't' },
  { 'scripts/health.js': 'b', 'scripts/eval.js': 'e2', 'scripts/adopter-arm.js': 'n', 'scripts/new-tool.js': 'z', 'scripts/ship-manifest.json': 'm' },
  { local: localCtxT, upstream: upCtxT });
check('상류 신규 중 전용(adopter-arm)은 제외 · 열거된 신규(new-tool · 매니페스트)는 배송', planC.newSync, ['scripts/new-tool.js', 'scripts/ship-manifest.json']);
check('상류 전용 변경(eval)은 갱신 안 함 · 열거 변경(health)은 갱신', planC.changedSync, ['scripts/health.js']);
check('로컬 사본(eval)은 upstreamOnlyLocal 로', planC.upstreamOnlyLocal, ['scripts/eval.js']);
check('localOwned·매니페스트 밖 로컬은 "사라진 파일" 오보 없음', planC.removedUpstream, []);
check('옛 로컬 매니페스트로 상류 신규를 거르지 않는다(상류 ctx 로 분류)', planC.newSync.includes('scripts/new-tool.js'), true);

// --- 상류 매니페스트 부재(구버전 상류): shipped null = 규칙 폴백 + 상류 전용 제외 · 남은 사본은 FS 기준 ---
const FB = { manifest: { shipped: null, upstreamOnly: ['scripts/eval.js', 'scripts/adopter-arm.js'], optional: [] }, localOwned: [] };
check('shipped null: 상류 전용은 제외', classifyPath('scripts/eval.js', FB), null);
check('shipped null: 그 외 스크립트는 규칙 폴백(sync)', classifyPath('scripts/anything.js', FB), 'sync');
const planFb = buildPlan({ 'scripts/health.js': 'a' }, { 'scripts/health.js': 'b', 'scripts/eval.js': 'e', 'scripts/adopter-arm.js': 'n' },
  { local: { manifest: { shipped: ['scripts/health.js'], upstreamOnly: ['scripts/eval.js', 'scripts/adopter-arm.js'], optional: [] }, localOwned: [], presentUpstreamOnly: ['scripts/eval.js'] }, upstream: FB });
check('구버전 상류에서도 전용 스크립트는 신규로 둔갑하지 않는다', planFb.newSync, []);
check('남은 사본은 FS(presentUpstreamOnly) 기준으로 보고', planFb.upstreamOnlyLocal, ['scripts/eval.js']);

// --- --force 경로 지정: 그 파일만 보호 해제, 나머지 개조는 보존(카나리아 실측 — localForked 7건 중 1건만 상류 수용) ---
const { forceTargets, localCtx, localTemplateFiles } = require('./template-update');
const G = { clean: ['a.js'], modified: ['dash.js', 'hist.js'], unknown: ['q.js'] };
check('force 없음: clean 만', forceTargets(G, false), { targets: ['a.js'], skipped: ['dash.js', 'hist.js', 'q.js'], unmatched: [] });
check('force 전부', forceTargets(G, true).targets, ['a.js', 'dash.js', 'hist.js', 'q.js']);
check('force 경로 1건: 그것만 + 나머지 보존 + 대상 아님 표기', forceTargets(G, ['dash.js', 'nope.js']), { targets: ['a.js', 'dash.js'], skipped: ['hist.js', 'q.js'], unmatched: ['nope.js'] });

// --- --seed [ref]: 네트워크 없이 전 파일 앵커(명시적 단언) ---
const { spawnSync: spawnTU } = require('child_process');
const seedTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tu-seed-'));
try {
  fs.mkdirSync(path.join(seedTmp, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(seedTmp, '.union-stack'), { recursive: true });
  fs.writeFileSync(path.join(seedTmp, 'scripts/health.js'), 'x\n');
  // run 은 __dirname 기준 root 라 CLI 는 상류를 본다 — 함수로 검증(seedAnchor 는 위에서 이미), CLI 는 상류 자신에 --seed 가 **쓰지 않게** 하기 위해 여기선 호출하지 않는다.
  seedAnchor(seedTmp, 'manual-test');
  const sa = JSON.parse(fs.readFileSync(path.join(seedTmp, ANCHOR_PATH), 'utf8'));
  check('seed: ref 라벨 + 로컬 해시', sa.ref === 'manual-test' && (sa.blobs['scripts/health.js'] || []).includes(gitBlobSha('x\n')), true);
} finally { fs.rmSync(seedTmp, { recursive: true, force: true }); }
check('--seed 는 main 의 분기(네트워크 전)에 있다', /argv\.indexOf\('--seed'\)/.test(fs.readFileSync(path.join(__dirname, 'template-update.js'), 'utf8')) && typeof spawnTU === 'function', true);

// --- staleDeps: 부분 갱신의 의존 불일치 경고(어답터 A 실측 — dashboard.js 는 갱신됐는데 그것이 require 하는 handoff-linter.js 는
//     앵커 없음으로 보존돼 `handoffPart is not a function`). 갱신 대상이 require 하는 파일이 "갱신 보류(변경됐는데 보존)" 이면 경고. ---
const { staleDeps } = require('./template-update');
const SRC = {
  'scripts/dashboard.js': "const { partBody } = require('./handoff-linter');\nconst { x } = require('./zfs_index');\n",
  'scripts/health.js': "const fs = require('fs');\nconst { lint } = require('./zfs-linter');\nconst gc = require('./gate-contract');\n",
  'scripts/handoff-linter.js': "module.exports = { analyze, run };\n",          // 보존된 옛 판 — partBody 없음
  'scripts/zfs-linter.js': "module.exports = { lint, run };\n",                // 보존됐지만 요구 심볼은 있다
};
const readSrc = p => (p in SRC ? SRC[p] : null);
// 심볼 수준(어답터 A 3차 실측: 경로만 보면 41쌍, 실제 불일치 1쌍) — missing 이 비면 정상 동작, null 은 판별 불가(기본 require·exports 없음)
check('갱신 대상 dashboard → 보류된 handoff-linter: 없는 심볼 partBody (zfs_index 는 보류 아님 · 신규 파일은 로컬 본문 없음 → 건너뜀)',
  staleDeps(readSrc, ['scripts/dashboard.js', 'scripts/health.js', 'scripts/new.js'], ['scripts/handoff-linter.js', 'scripts/other.js']),
  [{ file: 'scripts/dashboard.js', dep: 'scripts/handoff-linter.js', missing: ['partBody'] }]);
check('보존 파일이 요구 심볼을 export 하면 missing 빈 배열(⚠ 아님)', staleDeps(readSrc, ['scripts/health.js'], ['scripts/zfs-linter.js']), [{ file: 'scripts/health.js', dep: 'scripts/zfs-linter.js', missing: [] }]);
check('기본 require 는 판별 불가(null)', staleDeps(readSrc, ['scripts/health.js'], ['scripts/gate-contract.js']), [{ file: 'scripts/health.js', dep: 'scripts/gate-contract.js', missing: null }]);
check('보류 없음 → 경고 없음', staleDeps(readSrc, ['scripts/dashboard.js'], []), []);
check('의존이 갱신 대상에도 있으면(같이 갱신) 경고 없음', staleDeps(readSrc, ['scripts/dashboard.js', 'scripts/handoff-linter.js'], ['scripts/handoff-linter.js']), []);

// --- upstreamIgnored: 상류 파일 거부(어답터 C 실측 — Actions 폐기 레포에 harness.yml 이 매 --apply 마다 돌아옴, localOwned 는 sync 에 진다) ---
const igCtx = { manifest: { shipped: ['scripts/health.js', 'scripts/zfs_index.js'], upstreamOnly: [], optional: [] }, localOwned: [], upstreamIgnored: ['.github/workflows/harness.yml', 'scripts/health.js'] };
check('거부 글롭은 매니페스트 배송보다 우선 → null', classifyPath('scripts/health.js', igCtx), null);
check('거부 글롭: 워크플로 → null', classifyPath('.github/workflows/harness.yml', igCtx), null);
check('거부 없는 파일은 그대로', classifyPath('.github/workflows/harness.yml', { ...igCtx, upstreamIgnored: [] }), 'sync');
check('buildPlan: 거부 파일은 신규 sync 에 안 뜬다', buildPlan({}, { '.github/workflows/harness.yml': 'h', 'scripts/zfs_index.js': 'z' }, { upstream: igCtx, local: igCtx }).newSync, ['scripts/zfs_index.js']);
const igTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tu-ig-'));
try {
  fs.mkdirSync(path.join(igTmp, '.union-stack'), { recursive: true });
  fs.writeFileSync(path.join(igTmp, '.union-stack/adapter.json'), '{"upstreamIgnored": [".github/workflows/*.yml"]}');
  check('localCtx 가 adapter.json upstreamIgnored 를 읽는다', localCtx(igTmp).upstreamIgnored, ['.github/workflows/*.yml']);
} finally { fs.rmSync(igTmp, { recursive: true, force: true }); }

// --- 어답터 A 2차 실측 ② (a) scripts/ 밖 sync 파일(ci/Dockerfile · docker-compose.harness.yml)이 로컬에 있어도 매번 "신규"로 재등장 — 로컬 걷기가 그 경로를 안 본다 ---
const ltTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tu-local-'));
try {
  fs.mkdirSync(path.join(ltTmp, 'ci'), { recursive: true });
  fs.mkdirSync(path.join(ltTmp, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(ltTmp, 'ci/Dockerfile'), 'FROM node\n');
  fs.writeFileSync(path.join(ltTmp, 'docker-compose.harness.yml'), 'services: {}\n');
  fs.writeFileSync(path.join(ltTmp, 'scripts/health.js'), 'x\n');
  const lt = localTemplateFiles(ltTmp, { manifest: null, localOwned: [], upstreamIgnored: [], presentUpstreamOnly: [] });
  check('로컬 걷기: ci/Dockerfile · docker-compose.harness.yml 포함', ['ci/Dockerfile', 'docker-compose.harness.yml', 'scripts/health.js'].every(p => p in lt), true);
  check('로컬에 있는 컨테이너 파일은 신규가 아니다', buildPlan(lt, { 'ci/Dockerfile': gitBlobSha('FROM node\n'), 'docker-compose.harness.yml': gitBlobSha('services: {}\n') }).newSync, []);
} finally { fs.rmSync(ltTmp, { recursive: true, force: true }); }
// (b) 어답터가 만든 하위 디렉터리의 _GUIDE.md 는 템플릿 소유가 아니다 — 상류에 그 디렉터리가 없으면 "상류에서 사라진 파일"이 아니다
const gl = buildPlan({ '.union-stack/plan/research/_GUIDE.md': 'g', '.union-stack/plan/_GUIDE.md': 'p', '.union-stack/sprint/_GUIDE.md': 's' },
  { '.union-stack/plan/_GUIDE.md': 'p', '.union-stack/sprint/_GUIDE.md': 's2' });
check('상류에 없는 디렉터리의 _GUIDE 는 보고하지 않는다', gl.removedUpstream, []);
check('상류가 아는 디렉터리의 사라진 파일은 여전히 보고', buildPlan({ '.union-stack/plan/_GUIDE.md': 'p', '.union-stack/plan/PLAN-01_x.md': 'q' }, { '.union-stack/plan/PLAN-01_x.md': 'q', 'scripts/health.js': 'h' }).removedUpstream, ['.union-stack/plan/_GUIDE.md']);

// --- A 재적용 실측: 의존 불일치는 "이번 런의 갱신 대상" 만 보면 지난 회차에 갱신된 파일(dashboard) → 보존 파일(handoff-linter) 의 실재 불일치가 다시는 경고되지 않는다.
//     이미 상류와 동기화된 로컬 파일(syncedPaths)도 매 dry-run 의 검사 대상에 넣는다. ---
const { syncedPaths } = require('./template-update');
check('syncedPaths: 로컬 sha(후보 배열 포함)가 상류와 같은 파일만', syncedPaths({ 'a.js': ['A', 'A2'], 'b.js': ['B'], 'c.js': 'C' }, { 'a.js': 'A2', 'b.js': 'B9', 'c.js': 'C', 'd.js': 'D' }), ['a.js', 'c.js']);
check('동기화된 dashboard 가 보류된 handoff-linter 를 require → 매 런 경고', staleDeps(readSrc, [...syncedPaths({ 'scripts/dashboard.js': ['X'] }, { 'scripts/dashboard.js': 'X' })], ['scripts/handoff-linter.js']), [{ file: 'scripts/dashboard.js', dep: 'scripts/handoff-linter.js', missing: ['partBody'] }]);

// --- 어답터 C 제안 ⑤: 심볼 불일치가 있는 갱신 대상은 --apply 에서 보류(HOLD) — 받으면 로드 크래시다. --force <보존 파일> 로 함께 갱신할 때만 간다. ---
const { holdTargets } = require('./template-update');
const stale3 = [{ file: 'scripts/dashboard.js', dep: 'scripts/handoff-linter.js', missing: ['partBody'] }, { file: 'scripts/health.js', dep: 'scripts/zfs-linter.js', missing: [] }, { file: 'scripts/ci.js', dep: 'scripts/gate-contract.js', missing: null }];
check('불일치 대상만 보류(빈·null 은 통과)', holdTargets(['scripts/dashboard.js', 'scripts/health.js', 'scripts/ci.js'], stale3, false), { targets: ['scripts/health.js', 'scripts/ci.js'], held: [{ file: 'scripts/dashboard.js', dep: 'scripts/handoff-linter.js', missing: ['partBody'] }] });
check('--force 에 보존 파일이 있으면(함께 갱신) 보류 해제', holdTargets(['scripts/dashboard.js'], stale3, ['scripts/handoff-linter.js']).targets, ['scripts/dashboard.js']);
check('--force 전부면 보류 없음', holdTargets(['scripts/dashboard.js'], stale3, true).held, []);
check('이미 동기화된 파일(대상 아님)의 불일치는 보류 대상이 아니다', holdTargets(['scripts/health.js'], stale3, false).held, []);

// --- [WO-29a-1] 확인 캐시(lastCheck) · 신선도 · 제안문([PRO-29] ①(a)(b)) ---
const { checkSummary, readLastCheck, writeLastCheck, isFresh, changelogSince, renderProposal, CHECK_TTL_MS } = require('./template-update');
const planU = { changedSync: ['scripts/a.js'], newSync: ['scripts/b.js'], changedReview: ['AGENTS.md'], newReview: [], removedUpstream: [], upstreamOnlyLocal: [], dropped: [] };
const guardU = { safe: ['scripts/a.js'], modified: ['scripts/b.js'], unknown: [] };
const NOW = Date.parse('2026-10-19T00:00:00Z');
const sum = checkSummary({ ref: 'main', localVer: '6.0.0', upstreamVer: '6.1.0', plan: planU, guard: guardU, held: [{ file: 'scripts/a.js' }], migrations: ['- ⚠ x'] }, NOW);
check('요약: 업데이트 있음 · 수치', [sum.updates, sum.sync, sum.review, sum.held, sum.forked, sum.migrations, sum.at], [true, 2, 1, 1, 1, 1, '2026-10-19T00:00:00.000Z']);
const sumLatest = checkSummary({ ref: 'main', localVer: '6.1.0', upstreamVer: '6.1.0', plan: { ...planU, changedSync: [], newSync: [], changedReview: [] }, guard: { safe: [], modified: [], unknown: [] }, held: [], migrations: [] }, NOW);
check('요약: 최신', sumLatest.updates, false);

const tmpC = fs.mkdtempSync(path.join(os.tmpdir(), 'tu-cache-'));
try {
  check('캐시 없음 → null', readLastCheck(tmpC), null);
  fs.mkdirSync(path.join(tmpC, '.union-stack'), { recursive: true });
  fs.writeFileSync(path.join(tmpC, ANCHOR_PATH), JSON.stringify({ upstream: 'u', ref: 'clone', blobs: { 'scripts/a.js': 'abc' } }));
  writeLastCheck(tmpC, sum);
  check('lastCheck 쓰기는 앵커(blobs·ref)를 보존', [readAnchor(tmpC), JSON.parse(fs.readFileSync(path.join(tmpC, ANCHOR_PATH), 'utf8')).ref], [{ 'scripts/a.js': 'abc' }, 'clone']);
  check('lastCheck 읽기', readLastCheck(tmpC).upstreamVer, '6.1.0');
  seedAnchor(tmpC, 'manual');
  check('앵커 재기록이 lastCheck 를 지우지 않는다', !!readLastCheck(tmpC) && readLastCheck(tmpC).upstreamVer, '6.1.0');
  writeLastCheck(tmpC, { at: new Date(NOW).toISOString(), error: 'offline' });
  check('실패 기록은 직전 성공 요약을 지우지 않는다', [readLastCheck(tmpC).upstreamVer, readLastCheck(tmpC).error], ['6.1.0', 'offline']);
} finally { fs.rmSync(tmpC, { recursive: true, force: true }); }

check('TTL 24h', CHECK_TTL_MS, 24 * 3600 * 1000);
check('신선: 23h 전', isFresh({ at: new Date(NOW - 23 * 3600e3).toISOString() }, NOW), true);
check('만료: 25h 전', isFresh({ at: new Date(NOW - 25 * 3600e3).toISOString() }, NOW), false);
check('기록 없음 = 만료', isFresh(null, NOW), false);
check('실패 시각도 신선도에 든다(오프라인 재조회 폭주 방지)', isFresh({ at: new Date(NOW - 48 * 3600e3).toISOString(), errorAt: new Date(NOW - 1 * 3600e3).toISOString() }, NOW), true);

const CLP = '# Changelog\n## [Unreleased]\n- **미배포.** x\n## [6.2.0]\n- **둘째 항목.** 설명\n- ⚠ **마이그레이션.** 설명\n## [6.1.0]\n- **첫째.** 설명\n## [6.0.0]\n- **옛것.** 설명\n';
check('changelogSince: 로컬 이후 · Unreleased 제외', changelogSince(CLP, '6.0.0', '6.2.0').map(s => [s.ver, s.items.length]), [['6.2.0', 2], ['6.1.0', 1]]);
check('changelogSince: 항목 = 굵은 머리', changelogSince(CLP, '6.1.0', '6.2.0')[0].items[0], '둘째 항목.');
const prop = renderProposal({ localVer: '6.0.0', upstreamVer: '6.2.0', changelog: CLP, plan: planU, guard: guardU, held: [{ file: 'scripts/a.js', dep: 'scripts/c.js', missing: ['f'] }], migrations: ['- ⚠ **마이그레이션.** 설명'] });
check('제안문: 버전·⚠·HOLD·분기·review·적용 명령', [/6\.0\.0 → 6\.2\.0/.test(prop), /⚠/.test(prop), /scripts\/a\.js/.test(prop) && /HOLD|보류/.test(prop), /scripts\/b\.js/.test(prop), /AGENTS\.md/.test(prop), /template-update\.js --apply/.test(prop), /승인/.test(prop)], [true, true, true, true, true, true, true]);
check('changelogSince: includeUnreleased 면 맨 앞에 미릴리스', changelogSince(CLP, '6.2.0', '6.2.0', { includeUnreleased: true }).map(s => s.ver), ['Unreleased']);
check('changelogSince: 굵은 머리 없는 줄바꿈 항목은 … 로 끝난다', changelogSince('## [1.1.0]\n- wrapped line that continues\n  on the next line\n- done.\n', '1.0.0', '1.1.0')[0].items, ['wrapped line that continues…', 'done.']);
const propSame = renderProposal({ localVer: '6.2.0', upstreamVer: '6.2.0', changelog: CLP, plan: planU, guard: guardU, held: [], migrations: [] });
check('제안문: 같은 버전 + 파일 드리프트 → 미릴리스 항목을 보인다', /미릴리스/.test(propSame) && /미배포\./.test(propSame), true);
const propUnknown = renderProposal({ localVer: '6.0.0', upstreamVer: '6.2.0', changelog: CLP, plan: { ...planU, changedSync: ['scripts/a.js'], newSync: [] }, guard: { safe: [], modified: [], unknown: ['scripts/a.js'] }, held: [], migrations: [] });
check('제안문: 자동 갱신 0 + 앵커 없음 → --apply 는 아무것도 안 한다고 말하고 --force 를 안내', /--force/.test(propUnknown) && /자동 갱신\(sync\) 0건/.test(propUnknown), true);
const CLBIG = '## [Unreleased]\n' + Array.from({ length: 20 }, (_, i) => `- **항목 ${i}.** x`).join('\n') + '\n## [6.2.0]\n- **a.** x\n';
check('제안문: 버전별 15건 상한 + 외 N건', (() => { const p = renderProposal({ localVer: '6.2.0', upstreamVer: '6.2.0', changelog: CLBIG, plan: planU, guard: guardU, held: [], migrations: [] }); return /항목 14\./.test(p) && !/항목 15\./.test(p) && /외 5건/.test(p); })(), true);
// --- [WO-29a-4] updates = 실행 가능 항목이 있을 때만(5회차 실측: 3곳 모두 실행할 것 없이 상시 "업데이트 있음") ---
{
  const { reviewSeenFrom, readReviewSeen, writeReviewSeen } = require('./template-update');
  const P = (o = {}) => ({ changedSync: [], newSync: [], changedReview: [], newReview: [], removedUpstream: [], upstreamOnlyLocal: [], dropped: [], ...o });
  const G = (o = {}) => ({ safe: [], modified: [], unknown: [], ...o });
  const S = (o) => checkSummary({ ref: 'main', localVer: '6.0.0', upstreamVer: '6.0.0', plan: P(), guard: G(), held: [], migrations: [], upstreamMap: {}, reviewSeen: {}, ...o }, NOW);
  const forkOnly = S({ plan: P({ changedSync: ['scripts/a.js'] }), guard: G({ modified: ['scripts/a.js'] }) });
  check('보존 포크만 → updates false · auto 0 · forked 1', [forkOnly.updates, forkOnly.auto, forkOnly.forked], [false, 0, 1]);
  check('앵커 없음만 → updates false(키트/--force 안내는 제안문 몫)', S({ plan: P({ changedSync: ['scripts/a.js'] }), guard: G({ unknown: ['scripts/a.js'] }) }).updates, false);
  check('HOLD 만 → updates false', S({ plan: P({ changedSync: ['scripts/a.js'] }), held: [{ file: 'scripts/a.js' }] }).updates, false);
  check('자동 적용 대상 1 → updates true · auto 1', [S({ plan: P({ changedSync: ['scripts/a.js'] }) }).updates, S({ plan: P({ changedSync: ['scripts/a.js'] }) }).auto], [true, 1]);
  const rv = { plan: P({ changedReview: ['AGENTS.md'] }), upstreamMap: { 'AGENTS.md': 'R2' } };
  check('review 변화 · 본 적 없음 → reviewNew 1 · true', [S(rv).reviewNew, S(rv).updates], [1, true]);
  check('review 변화 · 이미 본 같은 상류 sha → reviewNew 0 · false', [S({ ...rv, reviewSeen: { 'AGENTS.md': 'R2' } }).reviewNew, S({ ...rv, reviewSeen: { 'AGENTS.md': 'R2' } }).updates], [0, false]);
  check('review 가 본 뒤 상류에서 또 바뀜 → 다시 true', S({ ...rv, reviewSeen: { 'AGENTS.md': 'R1' } }).updates, true);
  check('⚠ 마이그레이션 → true', S({ migrations: ['- ⚠ x'] }).updates, true);
  check('상류 릴리스 버전 뒤처짐 → true(릴리스 노트를 볼 일)', S({ localVer: '5.9.0' }).updates, true);
  check('reviewSeenFrom: review 경로 → 상류 sha 만', reviewSeenFrom(P({ changedReview: ['AGENTS.md'], newReview: ['README.md'], changedSync: ['scripts/a.js'] }), { 'AGENTS.md': 'R2', 'README.md': 'M1', 'scripts/a.js': 'X' }), { 'AGENTS.md': 'R2', 'README.md': 'M1' });
  const tmpR = fs.mkdtempSync(path.join(os.tmpdir(), 'tu-rs-'));
  try {
    fs.mkdirSync(path.join(tmpR, '.union-stack'), { recursive: true });
    fs.writeFileSync(path.join(tmpR, ANCHOR_PATH), JSON.stringify({ upstream: 'u', ref: 'clone', blobs: { 'scripts/a.js': 'abc' }, lastCheck: { at: 'x', updates: true } }));
    writeReviewSeen(tmpR, { 'AGENTS.md': 'R2' });
    check('reviewSeen 쓰기는 앵커·lastCheck 보존', [readAnchor(tmpR), readLastCheck(tmpR).at, readReviewSeen(tmpR)], [{ 'scripts/a.js': 'abc' }, 'x', { 'AGENTS.md': 'R2' }]);
    seedAnchor(tmpR, 'manual');
    check('앵커 재기록이 reviewSeen 을 지우지 않는다', readReviewSeen(tmpR), { 'AGENTS.md': 'R2' });
    writeLastCheck(tmpR, { at: 'y', updates: false });
    check('lastCheck 교체도 reviewSeen 보존', readReviewSeen(tmpR), { 'AGENTS.md': 'R2' });
    check('reviewSeen 없음 → {}', readReviewSeen(fs.mkdtempSync(path.join(os.tmpdir(), 'tu-rs0-'))), {});
  } finally { fs.rmSync(tmpR, { recursive: true, force: true }); }
}
check('제안문: 최신이면 한 줄', renderProposal({ localVer: '6.2.0', upstreamVer: '6.2.0', changelog: CLP, plan: { ...planU, changedSync: [], newSync: [], changedReview: [] }, guard: { safe: [], modified: [], unknown: [] }, held: [], migrations: [] }).trim().split('\n').length, 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
