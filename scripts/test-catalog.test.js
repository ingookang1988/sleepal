// scripts/test-catalog.test.js
// 생성 뷰 컴파일러([TOOL-28])의 순수 로직 + 실레포 통합. 실행: node scripts/test-catalog.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { extractTags, buildTable, inject, gather, run, CONTRACT } = require('./test-catalog');
const { validateContract } = require('./gate-contract');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

// --- 태그 추출(순수) ---
const tagged = [
  'const x = 1;',
  '// @test-asset 사본 픽스처 :: copy(a, b) — 사본에서',
  'function copy() {}',
].join('\n');
const t = extractTags(tagged, 'scripts/x.js');
check('태그 1건 추출', t.length === 1 && t[0].asset === '사본 픽스처' && t[0].file === 'scripts/x.js');
check('호출법 보존', t[0].usage === 'copy(a, b) — 사본에서');

// 자기언급 오염 방어([ADR-19]): 문자열/픽스처 속 인용·산문 속 언급·정규식 정의는 태그가 아니다.
const polluted = [
  "  const fx = '// @test-asset 유령 :: ghost()';",          // 따옴표 뒤 = 문자열
  '// 표기: "@test-asset <이름> :: <호출법>" 를 정의 지점에', // 산문 설명
  'const TAG_RE2 = /@test-asset/;',                           // 정규식 정의
].join('\n');
check('오염원 0건', extractTags(polluted, 'scripts/y.js').length === 0);

// --- 표 생성(순수): 파일→자산명 정렬, 한 자산 = 한 행 ---
const table = buildTable([
  { asset: 'b', file: 'scripts/z.js', usage: 'zb()' },
  { asset: 'a', file: 'scripts/z.js', usage: 'za()' },
  { asset: 'c', file: 'scripts/a.js', usage: 'ac()' },
]);
const lines = table.split('\n');
check('헤더 + 3행', lines.length === 5 && lines[0].includes('자산'));
check('정렬: 파일 우선, 자산명 차선', lines[2].includes('scripts/a.js') && lines[3].includes('| a |'));

// --- 주입(순수): 마커 필수, 지배적 EOL 추종 ---
check('마커 없으면 null', inject('본문뿐', table) === null);
const crlfDoc = '머리\r\n<!-- test-catalog:begin -->\r\n낡음\r\n<!-- test-catalog:end -->\r\n꼬리\r\n';
const injected = inject(crlfDoc, '| A | B | C |');
check('CRLF 문서엔 CRLF 로 주입', injected.includes('<!-- test-catalog:begin -->\r\n| A | B | C |\r\n<!-- test-catalog:end -->'));

// --- 픽스처 레포: 드리프트가 무는가([ADR-40] — 가드 검증) ---
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tcat-'));
fs.mkdirSync(path.join(tmp, 'scripts'));
fs.mkdirSync(path.join(tmp, '.union-stack/reference/contracts'), { recursive: true });
const CAT = '.union-stack/reference/contracts/CON-00_test_infra_catalog.md';
fs.writeFileSync(path.join(tmp, 'scripts/asset.js'),
  ['// @test-asset 픽스처 :: fx() — 예시', 'function fx() {}'].join('\n'));
fs.writeFileSync(path.join(tmp, CAT),
  ['# 카탈로그', '<!-- test-catalog:begin -->', '<!-- test-catalog:end -->'].join('\n'));
check('픽스처: 빈 블록 → CLARIFY(3)', run([], tmp) === 3);
check('픽스처: --write → PASS(0)', run(['--write'], tmp) === 0 && run([], tmp) === 0);
fs.writeFileSync(path.join(tmp, 'scripts/asset.js'), 'function fx() {}');   // 태그 제거 = 코드가 앞서감
check('픽스처: 태그 제거 후 드리프트 → CLARIFY(3)', run([], tmp) === 3);
fs.rmSync(path.join(tmp, CAT));
check('픽스처: 카탈로그 부재 → INFO PASS(0) — 어답터 미작성은 고장이 아니다', run([], tmp) === 0);
fs.rmSync(tmp, { recursive: true, force: true });

// --- 실레포 통합 ---
check('계약 완전성', validateContract(CONTRACT).length === 0);
const real = gather();
check('실레포: 자기 파일(test-catalog*.js)에서 유령 태그 0',
  real.every(a => a.file !== 'scripts/test-catalog.js' && a.file !== 'scripts/test-catalog.test.js'));
// 자산 수·블록 동기화는 상류 트리의 상태 — 어답터는 자기 카탈로그를 자기 CI 에서 본다([ADR-30]).
if (require('./adapter').isTemplateRepo()) {
  check('실레포: 자산 3건 이상', real.length >= 3);
  check('실레포: 블록 동기화(check PASS)', run([]) === 0);
} else check('어답터: run 은 계약 결과로 끝난다(0 PASS · 3 CLARIFY — 동기화 여부는 어답터 몫)', [0, 3].includes(run([])));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
