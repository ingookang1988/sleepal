// scripts/tools-index.test.js
// 순수 로직(parseCard, buildIndex, inject) 테스트. 실행: node scripts/tools-index.test.js
const { parseCard, buildIndex, inject, gather } = require('./tools-index');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

const CARD = '<!-- c -->\n---\nid: TOOL-09\ntitle: 테스트 도구\nkind: script   # script | cli\nimpl: scripts/x.js\n---\n# t\n\n## 용도\n한 줄 용도 설명.\n\n## 호출\n';

// --- parseCard ---
const c = parseCard(CARD);
check('id/title/impl 추출', c && c.id === 'TOOL-09' && c.title === '테스트 도구' && c.impl === 'scripts/x.js');
check('kind 주석 제거', c && c.kind === 'script');
check('용도 첫 줄 추출', c && c.purpose === '한 줄 용도 설명.');
check('frontmatter 없으면 null', parseCard('# no fm\n') === null);
check('필수 필드 결핍 → null', parseCard('---\nid: TOOL-09\n---\n') === null);

// --- buildIndex: id 정렬 + 한 줄 형식 ---
const idx = buildIndex([
  { id: 'TOOL-02', title: 'B', kind: 's', impl: 'b.js', purpose: 'bb' },
  { id: 'TOOL-01', title: 'A', kind: 's', impl: 'a.js', purpose: 'aa' },
]);
check('정렬', idx.indexOf('TOOL-01') < idx.indexOf('TOOL-02'));
check('한 줄 형식', idx.split('\n')[0] === '- **[TOOL-01]** A — aa (`a.js`)');

// --- inject ---
const AG = '# x\n<!-- tools-index:begin (generated) -->\nstale\n<!-- tools-index:end -->\ntail';
const injected = inject(AG, idx);
check('블록 치환', injected.includes('- **[TOOL-01]**') && !injected.includes('stale') && injected.endsWith('tail'));
check('마커 없으면 null', inject('# no markers', idx) === null);
check('멱등', inject(injected, idx) === injected);

// --- 개행 보존: CRLF 파일에 LF 블록을 박으면 다른 도구의 정규화마다 오탐한다 ---
const CRLF = AG.replace(/\n/g, '\r\n');
const injCRLF = inject(CRLF, idx);
check('CRLF 파일 → 블록도 CRLF', /begin[^\n]*-->\r\n- \*\*\[TOOL-01\]/.test(injCRLF));
check('CRLF 멱등(오탐 없음)', inject(injCRLF, idx) === injCRLF);
check('LF 파일은 LF 유지', /begin[^\n]*-->\n- \*\*\[TOOL-01\]/.test(injected));

// --- 실레포 통합 ---
const cards = gather();
check('실레포 카드 파싱(전부 필수 필드 보유)', cards.length >= 1 && cards.every(x => x.id && x.impl));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
