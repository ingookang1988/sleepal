// scripts/receipts.test.js
// 영수증 순수 로직([PRO-22] §3 2 · 2-bis): 러너 출력 파싱 · 3분할 판정 · 줄 스키마 · 나이 · 선언 초안 · 인용. 실행: node scripts/receipts.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseRunnerOutput, judge, formatReceipt, parseReceipts, latestByName, ageDays, scanDeclarations, append, read, citations, FILE } = require('./receipts');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

// --- 러너 출력 → 검사 대상 수 ---
const nt = parseRunnerOutput('# tests 41\n# suites 0\n# pass 39\n# fail 2\n# skipped 0\n');
check('node --test 파싱', nt.runner === 'node-test' && nt.targets === 41 && nt.passed === 39 && nt.failed === 2);
const je = parseRunnerOutput('Tests:       1 failed, 2 skipped, 12 passed, 15 total\nTime: 1s');
check('jest 파싱', je.runner === 'jest' && je.targets === 15 && je.passed === 12 && je.failed === 1 && je.skipped === 2);
check('pytest 파싱', parseRunnerOutput('collected 7 items\n...\n7 passed in 0.2s').targets === 7);
check('pytest 0건(collected 0)', parseRunnerOutput('collected 0 items\nno tests ran').targets === 0);
check('generic N passed', parseRunnerOutput('3 passed, 1 failed in 1s').targets === 4);
check('판독 불가는 null(0 아님)', parseRunnerOutput('tsc done').targets === null);

// --- judge: 2-bis 3분할 ---
check('blocking + targets 0 → REJECT', judge({ blocking: true }, { code: 0, targets: 0 }).outcome === 'REJECT');
check('비차단 + targets 0 → CLARIFY', judge({ blocking: false }, { code: 0, targets: 0 }).outcome === 'CLARIFY');
check('kind 메타 + 0 → NOOP_PASS', judge({ blocking: true, kind: '메타' }, { code: 0, targets: 0 }).outcome === 'NOOP_PASS');
check('expected_zero_unless: diff → NOOP_PASS', judge({ blocking: true, expected_zero_unless: 'diff' }, { code: 0, targets: 0 }).outcome === 'NOOP_PASS');
const envJ = judge({ blocking: true, expected_zero_unless: 'env' }, { code: 0, targets: 0 });
check('expected_zero_unless: env → CLARIFY + reason env', envJ.outcome === 'CLARIFY' && envJ.reason === 'env' && envJ.code === 3);
check('targets 있으면 PASS', judge({ blocking: true }, { code: 0, targets: 12 }).outcome === 'PASS');
check('targets 미판독은 PASS 지만 사유 표기', /미판독/.test(judge({ blocking: true }, { code: 0, targets: null }).reason));
check('러너 비영 종료: blocking → REJECT · 아니면 CLARIFY', judge({ blocking: true }, { code: 2, targets: 5 }).outcome === 'REJECT' && judge({ blocking: false }, { code: 1, targets: 5 }).outcome === 'CLARIFY');

// --- 줄 스키마 왕복 ---
const line = formatReceipt({ date: '2026-10-16', sha: 'abc1234', dirty: true, scope: 'product', name: 'unit', exit: 0, outcome: 'PASS', targets: 12, passed: 12, failed: 0, skipped: 0, reason: null, env: ['TZ=UTC', 'DB'], durMs: 812.4, gen: 'ci.js@6.0.0', cmd: 'pnpm test "a b"' });
check('줄 머리 [RCPT]', line.startsWith('- [2026-10-16][RCPT] sha=abc1234 dirty=yes scope=product name=unit exit=0 outcome=PASS targets=12'));
check('비움은 - · env 는 쉼표 · cmd 는 따옴표 끝', line.includes(' reason=- env=TZ=UTC,DB ') && line.endsWith(' gen=ci.js@6.0.0 cmd="pnpm test \'a b\'"'));
const parsed = parseReceipts('# h\n- (예시) [2026-01-01][RCPT] sha=0000000 name=x\n' + line + '\n- [2026-10-15][RCPT] sha=0ldsha1 dirty=no scope=harness name=tests exit=0 outcome=PASS targets=41 passed=39 failed=2 skipped=0 reason=- env=- dur=3ms gen=ci.js@6.0.0 cmd="node --test"\n');
check('파싱: 예시 제외 · 2건', parsed.length === 2 && parsed[0].name === 'unit' && parsed[0].targets === 12 && parsed[0].cmd === "pnpm test 'a b'");
check('파싱: 숫자 필드는 숫자', parsed[1].targets === 41 && parsed[1].failed === 2 && parsed[1].scope === 'harness');
const latest = latestByName(parsed.concat([{ date: '2026-10-16', name: 'tests', scope: 'harness', targets: 42 }]), 'harness');
check('최신 영수증: 날짜 기준', latest.get('tests').targets === 42 && !latest.has('unit'));
check('나이 계산', ageDays('2026-10-10', new Date('2026-10-16T12:00:00')) === 6 && ageDays('bad') === null);

// --- 선언 초안 ---
const draft = scanDeclarations({ scripts: { test: 'vitest', lint: 'eslint .', 'e2e:smoke': 'playwright', build: 'tsc -b', dev: 'next' },
  hooks: [{ hook: 'pre-push', cmd: 'pnpm test', file: '.husky/pre-push' }], workflows: [{ cmd: 'npm run lint', file: 'ci.yml' }] });
check('초안: 검사성 스크립트만(dev·build 제외)', draft.filter(c => c.source === 'package.json').map(c => c.name).join() === 'test,lint,e2e:smoke');
check('초안: kind 추정', draft.find(c => c.name === 'test').kind === '동작' && draft.find(c => c.name === 'lint').kind === '정적' && draft.find(c => c.name === 'e2e:smoke').kind === '재현');
check('초안: 훅·워크플로 행 + 차단은 사람이 확정(기본값만)', draft.some(c => c.source === '.husky/pre-push' && c.blocking) && draft.some(c => c.source === 'ci.yml' && !c.blocking));

// --- 인용 ---
const c = citations('구현 완료 rcpt:unit@abc1234 · rcpt:e2e@deadbeef0');
check('인용 파싱', c.refs.length === 2 && c.refs[0].name === 'unit' && c.refs[0].sha === 'abc1234' && !c.na);
check('n/a 인용', citations('rcpt:n/a — 소급 없음').na === true);

// --- append: 파일 없으면 헤더와 함께 · 러너 전용 ---
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rcpt-'));
try {
  check('없으면 null', read(tmp) === null);
  append(tmp, [line]);
  const txt = read(tmp);
  check('헤더 + 줄', txt.startsWith('<!-- [Raw] 실행 영수증') && txt.trimEnd().endsWith(line));
  append(tmp, [line.replace('abc1234', 'def5678')]);
  check('append 는 누적', parseReceipts(read(tmp)).length === 2 && fs.existsSync(path.join(tmp, FILE)));
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
