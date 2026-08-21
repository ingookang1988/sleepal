#!/usr/bin/env node
// scripts/gate-contract.js
// 게이트 계약 공통 계층([PRO-11] — 정본 [GRAM-12c]의 "꼴" 반입: 값·임계는 하네스가 정의).
// 각 게이트가 CONTRACT를 선언하고 `--contract` 플래그로 기계 판독 가능하게 노출한다.
// 계약을 읽는 이유([LSN-13]류 사고 예방): 게이트를 판정 근거로 인용하기 전에
// 그 게이트가 무엇을 보고 무엇을 *안* 보는지(scope)가 호출부에서 읽혀야 한다.
//
// 4값 결과와 차단 정책([PRO-11] §3-1 — 본 제안의 존재 이유):
//   PASS(0)    통과 — "참"이 아니라 "아직 반증되지 않음".
//   REJECT(1)  규범 위반 — **유일한 차단** 판정. CI·훅이 흐름을 중단한다.
//   CLARIFY(3) 질문 병기 후 진행 — 미비·모호의 표면화. 차단하지 않는다([PRO-07]의 도구화).
//   HOLD(4)    증거 부족 보류 — 대기열 기록. 차단하지 않는다.
// ⚠ 2를 건너뛴 이유: Claude Code 훅 계약이 exit 2 = 도구 차단(hook-pretool.js 참조).
//   비차단 결과에 2를 쓰면 훅 문맥에서 의미가 반전된다. [PRO-11]의 종료코드 매핑은
//   예시 값으로 승인됐고(frontmatter 참조) 차단 정책이 계약이므로, 정책 보존을 위해 조정.
const OUTCOME = { PASS: 0, REJECT: 1, CLARIFY: 3, HOLD: 4 };
const OUTCOME_NAME = Object.fromEntries(Object.entries(OUTCOME).map(([k, v]) => [v, k]));

/** 차단 정책: REJECT만 흐름을 중단한다. CI·훅 배선은 이 함수를 기준으로 매핑할 것. */
function isBlocking(code) { return code === OUTCOME.REJECT; }

/** "nonzero=실패" 관례의 셸/CI를 위한 접기 — 비차단 코드는 0으로. (annotation은 이미 stderr로 나감) */
function toShellExit(code) { return isBlocking(code) ? 1 : 0; }

// 계약 필수 필드. gate는 종류를 명시한 이름([GRAM-12c] 표기 규칙 — "Gate" 단독 금지),
// scope는 무엇을 보고 무엇을 안 보는지(사각지대 명시 — LSN-13의 3회 사고가 전부 여기서 남).
const REQUIRED_FIELDS = ['gate', 'input', 'predicate', 'scope', 'outcomes'];

/** 계약 선언 누락 필드 목록(순수) — 테스트가 게이트별 계약 완전성을 잡는다. */
function validateContract(c) {
  return REQUIRED_FIELDS.filter(f => !c || c[f] == null || c[f] === '' || (Array.isArray(c[f]) && !c[f].length));
}

/** run 래퍼: argv에 --contract가 있으면 계약 JSON만 출력하고 PASS. 아니면 본 run 실행. */
function withContract(contract, runFn) {
  return function runCli(argv = process.argv.slice(2)) {
    if (argv.includes('--contract')) {
      console.log(JSON.stringify({ ...contract, blocking: ['REJECT'], exit_codes: OUTCOME }, null, 2));
      return OUTCOME.PASS;
    }
    return runFn(argv);
  };
}

module.exports = { OUTCOME, OUTCOME_NAME, isBlocking, toShellExit, validateContract, withContract, REQUIRED_FIELDS };
