// scripts/gate-contract.test.js
// 계약 계층 단위 + 전 게이트 계약 완전성 통합. 실행: node scripts/gate-contract.test.js
const { OUTCOME, OUTCOME_NAME, isBlocking, toShellExit, validateContract, withContract } = require('./gate-contract');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(label, got, exp) {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  if (ok) pass++; else { fail++; console.error(`FAIL ${label}: got ${JSON.stringify(got)}, exp ${JSON.stringify(exp)}`); }
}

// --- 4값과 차단 정책([PRO-11]) ---
check('PASS=0', OUTCOME.PASS, 0);
check('REJECT=1', OUTCOME.REJECT, 1);
check('CLARIFY=3', OUTCOME.CLARIFY, 3);
check('HOLD=4 (2는 훅 차단 계약과 충돌하므로 건너뜀)', OUTCOME.HOLD, 4);
check('2는 어떤 결과에도 배정되지 않음(hook-pretool exit 2 = 차단)', Object.values(OUTCOME).includes(2), false);
check('REJECT만 차단', [OUTCOME.PASS, OUTCOME.REJECT, OUTCOME.CLARIFY, OUTCOME.HOLD].map(isBlocking), [false, true, false, false]);
check('셸 접기: 비차단 → 0', [toShellExit(OUTCOME.CLARIFY), toShellExit(OUTCOME.HOLD), toShellExit(OUTCOME.REJECT)], [0, 0, 1]);
check('역명', OUTCOME_NAME[3], 'CLARIFY');

// --- 계약 검증 ---
check('완전한 계약 → 누락 없음', validateContract({ gate: 'X Gate', input: 'i', predicate: 'p', scope: 's', outcomes: ['PASS'] }), []);
check('빈 계약 → 전 필드 누락', validateContract({}).length, 5);
check('outcomes 빈 배열 → 누락', validateContract({ gate: 'g', input: 'i', predicate: 'p', scope: 's', outcomes: [] }), ['outcomes']);

// --- withContract: --contract 시 계약 출력 + PASS, 아니면 본 run ---
const wrapped = withContract({ gate: 'T Gate', input: 'i', predicate: 'p', scope: 's', outcomes: ['PASS'] }, () => 7);
const origLog = console.log; let logged = '';
console.log = s => { logged += s; };
const contractExit = wrapped(['--contract']);
console.log = origLog;
check('--contract → PASS 종료', contractExit, OUTCOME.PASS);
const printed = JSON.parse(logged);
check('--contract 출력에 blocking 명시', printed.blocking, ['REJECT']);
check('--contract 출력에 exit_codes 포함', printed.exit_codes.CLARIFY, 3);
check('플래그 없으면 본 run 실행', wrapped([]), 7);

// --- 통합: 게이트 6종 전부가 완전한 계약을 선언하는가 ---
// 템플릿 전용 게이트는 `init --drop-template-bits` 가 삭제한다 — 어답터에선 **파일 부재**가 정상이다.
// 부재만 건너뛴다(존재하는데 require 가 던지면 그대로 터진다 — 고장을 조용히 넘기지 않는다).
const TEMPLATE_ONLY = new Set(['./leakage-guard']);
for (const mod of ['./zfs-linter', './history-linter', './permission-guard', './leakage-guard', './health', './handoff-linter']) {
  if (TEMPLATE_ONLY.has(mod) && !fs.existsSync(path.join(__dirname, mod.slice(2) + '.js'))) {
    console.log(`(${mod} 없음: 템플릿 전용 게이트 — 계약 검사 건너뜀)`); continue;
  }
  const { CONTRACT } = require(mod);
  check(`${mod} 계약 완전성`, validateContract(CONTRACT), []);
  check(`${mod} 게이트 이름에 종류 명시("Gate" 단독 금지)`, /gate/i.test(CONTRACT.gate) && CONTRACT.gate.trim().toLowerCase() !== 'gate', true);
}
// handoff-linter만 REJECT 없는 게이트다([PRO-13] §5)
check('handoff 계약에 REJECT 없음', require('./handoff-linter').CONTRACT.outcomes.includes('REJECT'), false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
