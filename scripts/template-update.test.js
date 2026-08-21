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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
