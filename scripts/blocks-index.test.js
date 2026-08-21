// scripts/blocks-index.test.js
// 순수 로직(extractBlocks, frontmatterId, buildIndex, inject) 테스트. 실행: node scripts/blocks-index.test.js
const { stripFences, extractBlocks, frontmatterId, buildIndex, inject, gather, CONTRACT } = require('./blocks-index');
const { validateContract } = require('./gate-contract');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

// --- extractBlocks: 원장 행(줄에 [ID]가 있는 꼴) ---
const LEDGER = [
  '# Architecture Decision Ledger',
  '- [2026-01-01][ADR-01]: (예시) blocks 없는 평범한 결정 — 인덱스에 오르지 않는다.',
  '  - [ADR-08] blocks: "런타임 훅 설치 재제안" · reopen_when: "배치 승인 단위 훅 지원 시"',
  '  - [ADR-15] blocks: "시나리오 층 확대"',
].join('\n');
const led = extractBlocks(LEDGER);
check('blocks 없는 줄은 제외', led.length === 2);
check('줄의 [ID]로 귀속', led[0].id === 'ADR-08' && led[1].id === 'ADR-15');
check('blocks 값 추출', led[0].blocks === '런타임 훅 설치 재제안');
check('reopen_when 추출', led[0].reopen_when === '배치 승인 단위 훅 지원 시');
check('reopen_when 없으면 null', led[1].reopen_when === null);

// 날짜 대괄호가 ID로 오인되지 않는다(마지막 [ID] 토큰 규칙 + 도메인 대문자 제약).
check('날짜 토큰 오인 없음', extractBlocks('- [2026-01-01][ADR-09] blocks: "x"')[0].id === 'ADR-09');

// --- extractBlocks: PRO frontmatter(줄에 [ID] 없음 → fallback) ---
const PRO = '---\nid: PRO-01\nstatus: Rejected\nblocks: "같은 (예시) 제안의 재상정"\nreopen_when: "전제가 바뀔 때"\n---\n# x';
check('frontmatter id 추출', frontmatterId(PRO) === 'PRO-01');
const pro = extractBlocks(PRO, frontmatterId(PRO));
check('fallbackId로 귀속', pro.length === 1 && pro[0].id === 'PRO-01');
check('귀속 불가면 버림', extractBlocks('blocks: "고아 표식"').length === 0);

// --- buildIndex: id 정렬 + 한 줄 형식 ---
const idx = buildIndex([
  { id: 'PRO-01', blocks: 'B', reopen_when: null },
  { id: 'ADR-08', blocks: 'A', reopen_when: '조건' },
]);
check('정렬', idx.indexOf('ADR-08') < idx.indexOf('PRO-01'));
check('한 줄 형식', idx.split('\n')[0] === '- ⛔ **[ADR-08]** A — 재개 조건: 조건');
check('reopen_when 미기입 표면화', idx.split('\n')[1].endsWith('재개 조건 미기입'));

// --- inject ---
const AG = '# x\n<!-- blocks-index:begin (generated) -->\nstale\n<!-- blocks-index:end -->\ntail';
const injected = inject(AG, idx);
check('블록 치환', injected.includes('**[ADR-08]**') && !injected.includes('stale') && injected.endsWith('tail'));
check('마커 없으면 null', inject('# no markers', idx) === null);
check('빈 인덱스는 (없음)', inject(AG, '').includes('- (없음)'));
// CRLF 레포에서 LF 고정 주입은 거짓 드리프트를 낳는다([TOOL-07]과 같은 함정, [ADR-16] D2 계열).
const CRLF = AG.split('\n').join('\r\n');
check('지배적 EOL 보존(CRLF)', !/(?<!\r)\n/.test(inject(CRLF, idx)));

// --- 자기언급 오염 회귀([ADR-07] — 실측으로 재현된 결함) ---
// 문서가 *자기 표식 문법을 설명하는* 예시를 담으면 계측이 그것을 실제 항목으로 센다.
const SELFREF = [
  '문서가 표식 문법을 설명한다. 가공 예시(example):',
  '```text',
  '- [2026-07-24][ADR-08]: … blocks: "런타임 훅 설치 재제안"',
  '  reopen_when: "배치 승인 단위 훅 지원 시"',
  '```',
  '- [ADR-99] blocks: "펜스 밖의 진짜 표식" · reopen_when: "조건"',
].join('\n');
const sr = extractBlocks(SELFREF);
check('펜스 안 예시는 집계하지 않음', sr.length === 1 && sr[0].id === 'ADR-99');
check('stripFences가 펜스 내부를 비움', stripFences(SELFREF).filter(l => l.includes('ADR-08')).length === 0);
check('펜스 미닫힘은 이후 전부 제외(보수적)', extractBlocks('```\n- [ADR-01] blocks: "x"').length === 0);
// 3겹째: 오염을 *기록하는* 줄이 다시 오염원이 된다(ADR-19 작성 중 실제 발생).
check('인라인 코드 스팬 내 예시 제외',
  extractBlocks('- [ADR-19]: 오염 사례 `[ADR-08] blocks: "예시"` 를 인용한다.').length === 0);
check('코드 스팬 밖 표식은 살아남음',
  extractBlocks('- [ADR-19]: `코드` 뒤의 blocks: "진짜" · reopen_when: "조건"')[0].blocks === '진짜');

// --- 실레포 통합: 예시가 실항목으로 새지 않는가 ---
const real = gather();
check('실레포 항목에 중복 id 없음', new Set(real.map(i => i.id)).size === real.length);
check('실레포 항목 전부 reopen_when 보유', real.every(i => i.reopen_when));

// --- 계약 완전성 ---
check('CONTRACT 필수 필드 완비', validateContract(CONTRACT).length === 0);

// --- parseLedger: 원장 실행만(예시 행·하위 메타 행·본문 언급 제외) — 시간축 페이지 소비 ---
const { parseLedger } = require('./blocks-index');
const ledgerFix = [
  '- (예시) [2026-01-01][ADR-01]: 예시 행.',
  '- [2026-08-18][ADR-23]: 실행 하나.',
  '  - [ADR-23] blocks: "x" · reopen_when: "y"',
  '본문 속 [ADR-99] 언급.',
  '- [2026-08-19][ADR-24]: 실행 둘 — 상세.',
].join('\n');
const rows = parseLedger(ledgerFix);
check('parseLedger 실행 2건', rows.length === 2);
check('parseLedger 날짜·id·본문', rows[0].date === '2026-08-18' && rows[0].id === 'ADR-23' && rows[1].text.startsWith('실행 둘'));
check('parseLedger 빈 입력', parseLedger('').length === 0);

console.log(`blocks-index.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
