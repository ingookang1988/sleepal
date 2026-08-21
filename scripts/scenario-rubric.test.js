// scripts/scenario-rubric.test.js
// 순수 판정(judge) 테스트 — FS 비의존. 실행: node scripts/scenario-rubric.test.js
const { judge } = require('./scenario-rubric');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

const sh = command => ({ name: 'Bash', input: { command } });
const ed = file_path => ({ name: 'Edit', input: { file_path } });
const wr = file_path => ({ name: 'Write', input: { file_path } });

// 정상 궤적: 재현 → 수정 → 회귀 테스트 → 실행
const good = judge([
  sh('node scripts/foo.test.js'), ed('scripts/foo.js'), wr('scripts/foo.test.js'), sh('node scripts/foo.test.js'),
]);
check('정상 궤적 ok', good.verdict === 'ok' && good.repro && good.regression);
check('편집 파일 2개', good.editFiles === 2 && good.editCalls === 2);
check('실행 2회', good.runCalls === 2);

// 재현 없이 바로 편집 → repro 실패
const noRepro = judge([ed('scripts/foo.js'), wr('scripts/foo.test.js'), sh('node scripts/foo.test.js')]);
check('재현 선행 없음 → fail', noRepro.verdict === 'fail' && !noRepro.repro && noRepro.regression);
check('사유 no-repro', noRepro.reasons.some(r => r.startsWith('no-repro')));

// 회귀 테스트 없음 → regression 실패
const noReg = judge([sh('node x.js'), ed('scripts/foo.js'), sh('node x.js')]);
check('회귀 테스트 없음 → fail', noReg.verdict === 'fail' && noReg.repro && !noReg.regression);

// 테스트를 편집했으나 그 뒤 실행이 없음 → regression 실패(작성만 하고 안 돌린 경우)
const wroteNotRan = judge([sh('node x.js'), ed('scripts/foo.js'), wr('scripts/foo.test.js')]);
check('테스트 작성만 → fail', wroteNotRan.verdict === 'fail' && !wroteNotRan.regression);

// 실행이 아닌 셸(ls/git)은 재현으로 세지 않는다
const notRun = judge([sh('ls -la'), sh('git status'), ed('a.js'), wr('a.test.js'), sh('ls')]);
check('비실행 셸은 repro 아님', !notRun.repro);
check('비실행 셸은 regression 아님', !notRun.regression);

// 체인 뒤의 실행 동사도 인식
check('체인 뒤 실행 인식', judge([sh('cd d:/x && node t.test.js'), ed('a.js'), wr('a.test.js'), sh('npm test')]).verdict === 'ok');

// 다언어 테스트 경로 관례
for (const p of ['pkg/test_thing.py', 'a/b_test.go', 'x.spec.ts', 'y.test.js']) {
  check(`테스트 경로 인식: ${p}`, judge([sh('node a'), ed('src.js'), wr(p), sh('pytest')]).regression);
}
// 윈도 역슬래시 경로
check('역슬래시 경로 인식', judge([sh('node a'), ed('src.js'), wr('scripts\\foo.test.js'), sh('node b')]).regression);

// 편집 내용은 절대 보지 않는다([ADR-07]) — 내용에 "test"가 있어도 경로가 아니면 회귀 아님
check('내용 오염 없음', !judge([sh('node a'), wr('docs/about-tests.md'), sh('node b')]).regression);

// 빈 궤적
const empty = judge([]);
check('빈 궤적 fail', empty.verdict === 'fail' && empty.editFiles === 0 && empty.reasons.length === 2);

// 같은 파일 반복 편집은 파일 1개로 센다(최소성 수치)
check('중복 편집 파일 1개', judge([ed('a.js'), ed('a.js'), ed('a.js')]).editFiles === 1);
check('중복 편집 호출 3회', judge([ed('a.js'), ed('a.js'), ed('a.js')]).editCalls === 3);

// --- gatherSessions: 런 정의(발화 있는 세션) + 서브에이전트 합류 ---
const fs = require('fs'), path = require('path'), os = require('os');
const { gatherSessions } = require('./scenario-rubric');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rubric-'));
const line = o => JSON.stringify(o) + '\n';
const uLine = (ts) => line({ type: 'user', timestamp: ts, message: { role: 'user', content: '고쳐줘' } });
const aLine = (ts, name, input, side) => line({ type: 'assistant', timestamp: ts, isSidechain: !!side,
  message: { role: 'assistant', content: [{ type: 'tool_use', name, input }] } });

fs.writeFileSync(path.join(tmp, 'run-1.jsonl'),
  uLine('2026-01-01T00:00:00Z') + aLine('2026-01-01T00:02:00Z', 'Edit', { file_path: 'a.js' }));
fs.mkdirSync(path.join(tmp, 'run-1', 'subagents'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'run-1', 'subagents', 'agent-x.jsonl'),
  aLine('2026-01-01T00:01:00Z', 'Bash', { command: 'node a.test.js' }, true));

const got = gatherSessions(tmp);
check('발화 없는 서브에이전트 전사는 런이 아니다', got.length === 1 && got[0].session === 'run-1');
check('서브에이전트 호출이 부모 런에 합류', got[0].calls.length === 2);
check('시간순 정렬(서브에이전트 실행이 편집보다 앞)', got[0].calls[0].name === 'Bash' && got[0].calls[1].name === 'Edit');
check('합류 결과로 repro 인정', judge(got[0].calls).repro === true);
fs.rmSync(tmp, { recursive: true, force: true });
check('없는 디렉터리 → 빈 배열', gatherSessions(path.join(tmp, 'nope')).length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
