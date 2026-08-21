// eval/e6-suite/defects.js
// E6 과제 스위트 — 이 레포의 **실결함 5건**을 과거 수정 커밋에서 역산해 재주입한다.
//
// 왜 역산인가: 합성 버그는 난이도가 인위적이고, 실결함은 이 레포의 실제 실패 분포를 따른다.
// 왜 히스토리 없는 워크스페이스인가: 수정 커밋이 히스토리에 남아 있으면 두 팔 모두 `git log` 조회로
//   즉답할 수 있어 델타가 씻긴다(`eval/PROTOCOL.md` §3-bis 과제 오염 처방).
//
// 각 결함의 구성:
//   edits — 소스에 **옛 구현을 되돌린다**(=결함 주입). find는 파일에 정확히 1회만 나와야 한다(빌더가 검증).
//   strip — 그 결함을 *지목하는* 테스트 단언 블록을 워크스페이스에서 제거한다.
//           남겨두면 실패 메시지가 원인을 그대로 알려줘 과제가 사라진다.
//   oracle — strip한 그 테스트 파일이 **숨은 오라클**이다(원 수정 커밋의 회귀 테스트).
//           팔 종료 후 원본을 워크스페이스에 넣고 돌려 정답 여부를 판정한다.
//   prompt — 런의 **유일한 발화**. 증상만 적고 원인·파일·함수는 절대 적지 않는다.
//
// 개행: find/strip은 LF 기준으로 적는다(빌더가 파일을 LF로 정규화해 적용하고 원래 개행으로 되돌린다).

module.exports = [
  {
    id: 'D1',
    title: '컨텍스트 예산이 한국어 문서를 과소평가',
    origin: 'c3104e3',
    testFile: 'scripts/context-budget.test.js',
    prompt: '컨텍스트 예산 점검이 못 미덥다. 이 레포는 문서 대부분이 한국어인데 `node scripts/context-budget.js`가 보고하는 토큰 수가 실제 체감의 절반도 안 되고, 그래서 늘 "예산 내"로만 나온다. 확인해서 고쳐줘.',
    edits: [{
      file: 'scripts/context-budget.js',
      // CJK 범위 리터럴은 육안으로 같아도 코드포인트가 달라질 수 있어 정확 문자열로 잡지 않는다.
      findRe: /\/\/ 스크립트별 문자\/토큰 계수\.[^\n]*\nconst CJK_RE = [^\n]*\nconst CHARS_PER_TOKEN = [^\n]*\n\n\/\*\* 거친 토큰 추정[^\n]*\nfunction estimateTokens\(text\) \{\n[^]*?\n\}/,
      replace: `// 거친 토큰 추정(영문 ~4 char/token; 한글 혼재로 보수적이나 추세 추적엔 충분).
function estimateTokens(text) { return Math.ceil((text || '').length / 4); }`,
    }, {
      file: 'scripts/context-budget.js',
      find: 'module.exports = { estimateTokens, computeBudget, gather, BUDGETS, TOTAL_CAP, CHARS_PER_TOKEN };',
      replace: 'module.exports = { estimateTokens, computeBudget, gather, BUDGETS, TOTAL_CAP };',
    }],
    strip: [
      '// estimateTokens — 스크립트별 계수(라틴 ~4자/토큰, CJK ~1.5자/토큰)\n',
      "// 회귀: char/4 단일 계수는 한국어를 2~3배 과소평가했다(같은 길이 문자열 비교)\nconst ko = '한글문장열두글자다', en = 'abcdefghi';\n",
    ],
    stripChecks: ['한글은 라틴보다 비싸다', '한글 4자 ≈ 3토큰', '한자·가나도 CJK 계수',
      '동일 길이에서 한글 추정치가 2배 이상'],
  },

  {
    id: 'D2',
    title: 'tools-index가 갱신 직후에도 드리프트로 Fail-close',
    origin: '12f5d89',
    testFile: 'scripts/tools-index.test.js',
    prompt: '갓 체크아웃한 상태에서 아무것도 안 건드렸는데 `node scripts/tools-index.js`가 인덱스 드리프트라며 Fail-close한다. `--write`로 한 번 갱신하면 조용해지지만 파일이 다시 정규화되면 또 그런다. 확인해서 고쳐줘.',
    edits: [{
      file: 'scripts/tools-index.js',
      find: `/**
 * AGENTS 텍스트의 마커 블록에 인덱스 주입(순수). 마커 없으면 null.
 * 블록은 **파일의 지배적 개행**을 따른다 — LF로 고정 주입하면 CRLF 레포에서 다른 도구가 파일을
 * 정규화할 때마다 check가 오탐(거짓 Fail-close)한다.
 */
function inject(agentsTxt, index) {
  if (!BLOCK_RE.test(agentsTxt)) return null;
  const eol = (agentsTxt.match(/\\r\\n/g) || []).length > (agentsTxt.match(/(?<!\\r)\\n/g) || []).length ? '\\r\\n' : '\\n';
  const body = index.split('\\n').join(eol);
  return agentsTxt.replace(BLOCK_RE, (_, b, __, e) => \`\${b}\${eol}\${body}\${eol}\${e}\`);
}`,
      replace: `/** AGENTS 텍스트의 마커 블록에 인덱스 주입(순수). 마커 없으면 null. */
function inject(agentsTxt, index) {
  if (!BLOCK_RE.test(agentsTxt)) return null;
  return agentsTxt.replace(BLOCK_RE, (_, b, __, e) => \`\${b}\\n\${index}\\n\${e}\`);
}`,
    }],
    strip: [`// --- 개행 보존: CRLF 파일에 LF 블록을 박으면 다른 도구의 정규화마다 오탐한다 ---
const CRLF = AG.replace(/\\n/g, '\\r\\n');
const injCRLF = inject(CRLF, idx);
check('CRLF 파일 → 블록도 CRLF', /begin[^\\n]*-->\\r\\n- \\*\\*\\[TOOL-01\\]/.test(injCRLF));
check('CRLF 멱등(오탐 없음)', inject(injCRLF, idx) === injCRLF);`],
  },

  {
    id: 'D3',
    title: 'blast-radius가 본문의 status 예시를 잠금으로 오인',
    origin: 'a11f9e0',
    testFile: 'scripts/zfs_index.test.js',
    prompt: '`node scripts/blast-radius.js 01`이 `.union-stack/plan/PLAN-01a_example_doc.md`를 Live로 잠겨 있다며 Fail-close한다. 그 문서를 잠근 적이 없고 frontmatter에 status 자체가 없다. 확인해서 고쳐줘.',
    files: [{
      path: '.union-stack/plan/PLAN-01a_example_doc.md',
      content: '---\nid: PLAN-01a\n---\n\n# 예시 문서 (상태 표기 설명용)\n\n상태 줄은 frontmatter에 이렇게 적는다:\n\n```\nstatus: Live\n```\n',
    }],
    edits: [{
      file: 'scripts/zfs_index.js',
      find: `// frontmatter(선두 --- 블록)에서만 status를 추출. 없으면 null.
// 파일 전체 매칭은 본문 예시(\`status: Live\` 코드블록 등)를 잠금 상태로 오인해
// blast-radius 오차단(false Fail-close)을 일으킨다. 선두 HTML 주석은 건너뛴다.
function readStatus(full) {
  try {
    const txt = fs.readFileSync(full, 'utf8');
    const fm = txt.match(/^(?:\\s|<!--[\\s\\S]*?-->)*---\\r?\\n([\\s\\S]*?)\\r?\\n---/);
    if (!fm) return null;
    const m = fm[1].match(/^\\s*status:\\s*(.+?)\\s*$/m);
    return m ? m[1].trim() : null;`,
      replace: `// frontmatter에서 status 한 줄만 의존성 없이 추출. 없으면 null.
function readStatus(full) {
  try {
    const txt = fs.readFileSync(full, 'utf8');
    const m = txt.match(/^\\s*status:\\s*(.+?)\\s*$/m);
    return m ? m[1].trim() : null;`,
    }],
    strip: [`// --- readStatus: frontmatter 스코핑 (본문 status를 잠금으로 오인 → 오차단 회귀 방지) ---`],
    stripChecks: ['선두주석+frontmatter status 추출', '본문 코드블록의 status 무시', 'frontmatter 없으면 null'],
  },

  {
    id: 'D4',
    title: '훅이 기술 토큰(UTF-8·SHA-256)을 작업 ID로 오인',
    origin: 'a11f9e0',
    testFile: 'scripts/hooks.test.js',
    prompt: '훅 쪽 파서가 엉뚱한 걸 작업 ID로 잡는다 — "save as UTF-8 encoding" 같은 문장이나 `docs/UTF-8_notes.md` 같은 파일명에서 존재하지도 않는 노드를 집어낸다. 확인해서 고쳐줘.',
    edits: [{
      file: 'scripts/hooks.js',
      find: `  // 파일명이 ZFS 노드일 때만 blast-radius 검사 — 도메인 화이트리스트 대조 없이는
  // UTF-8_notes.md 같은 일반 파일명의 \`UTF\`-\`8\`이 노드 ID로 오인된다(parseId는 구조만 본다).
  const base = path.basename(rel);
  const dm = base.match(/^([A-Z]{2,6})-/);
  const id = dm && isValidDomain(dm[1]) ? parseId(base) : null;`,
      replace: '  const id = parseId(path.basename(rel));',
    }, {
      file: 'scripts/hooks.js',
      find: `// 프롬프트에서 첫 *유효 도메인* ZFS 작업 ID(브래킷/플레인 모두) 추출. 없으면 null.
// 도메인을 VALID_DOMAINS와 대조하지 않으면 UTF-8→\`8\`, SHA-256→\`256\` 같은
// 기술 토큰이 컨텍스트 주입 트리거가 된다. 무효 도메인은 건너뛰고 다음 후보를 본다.
const WORKID_RE = /\\b([A-Z]{2,6})-([0-9][0-9a-z-]*)\\b/g;
function extractWorkId(prompt) {
  for (const m of String(prompt || '').matchAll(WORKID_RE)) {
    if (!isValidDomain(m[1])) continue;
    const id = parseId(\`\${m[1]}-\${m[2]}\`);
    if (id) return id;
  }
  return null;
}`,
      replace: `// 프롬프트에서 첫 ZFS 작업 ID(브래킷/플레인 모두) 추출. 없으면 null.
const WORKID_RE = /\\b([A-Z]{2,6})-([0-9][0-9a-z-]*)\\b/;
function extractWorkId(prompt) {
  const m = String(prompt || '').match(WORKID_RE);
  if (!m) return null;
  return parseId(\`\${m[1]}-\${m[2]}\`);
}`,
    }, {
      file: 'scripts/hooks.js',
      find: "const { parseId, isValidDomain } = require('./zfs_util');",
      replace: "const { parseId } = require('./zfs_util');",
    }],
    strip: [`// 도메인 화이트리스트 대조 — 기술 토큰이 작업 ID로 오인되면 안 된다`],
    stripChecks: ['UTF-8 → null', 'SHA-256 → null', '무효 도메인 건너뛰고 유효 ID 추출',
      'UTF-8_notes.md 는 ZFS 노드 아님(blast-radius 미발동)'],
  },

  {
    id: 'D5',
    title: 'append-only 가드가 표 데이터 행 삭제를 놓친다',
    origin: 'a11f9e0',
    testFile: 'scripts/permission-guard.test.js',
    prompt: '`.union-stack/archive_ledger.md`는 append-only인데, 과거 **표 행** 하나를 통째로 지워도 `node scripts/permission-guard.js`가 그냥 통과시킨다. 주석이나 제목이 아니라 실제 기록 한 줄인데도 안 잡힌다. 확인해서 고쳐줘.',
    edits: [{
      file: 'scripts/permission-guard.js',
      find: `/**
 * 삭제된 줄이 *실제 엔트리*인지 판정(순수). 헤더 주석·제목·표 구분선만 제외 —
 * 데이터가 담긴 표 행은 엔트리로 센다(원장·회의록 엔트리가 표 행이므로, \`^\\|\` 일괄 제외는 사각지대).
 * 표머리 행 편집이 걸리는 false-positive는 감수한다(Fail-close 방향 — 인간이 확인).
 */
function isSubstantiveLine(t) {
  if (!t) return false;
  if (/^<!--|-->$|^#/.test(t)) return false;   // 주석·제목
  if (/^\\|[\\s|:-]*\\|?$/.test(t)) return false; // 표 구분선(|---|---|)·빈 표 라인
  return true;
}`,
      replace: `/** 삭제된 줄이 *실제 엔트리*인지 판정(순수). 주석·제목·표 라인은 제외(거짓 양성 방지). */
function isSubstantiveLine(t) {
  if (!t) return false;
  return !/^<!--|-->$|^#|^\\|/.test(t);
}`,
    }],
    strip: [],
    stripChecks: ['표 데이터 행 삭제 = 실질(사각지대 회귀 방지)'],
  },
];
