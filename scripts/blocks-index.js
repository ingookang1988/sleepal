#!/usr/bin/env node
// scripts/blocks-index.js
// 재제안 차단 표식의 *상시 주입 인덱스* 컴파일러 — [PRO-14].
// 근거: 이 하네스는 거부·결정 기록의 **보존**을 이미 규율로 갖는다(proposals/_GUIDE.md의
//   Supersession principle — "the agent reads it and stops repeating"). 없는 것은 그 "reads it"의
//   경로다. upward-fetch는 PLAN/FLOW/CON/ARCH/MTG+LSN만 모으고, 부트스트랩은 원장·proposals를
//   포함하지 않는다. 유일한 경로가 HANDOFF(latest-only)에 손으로 옮겨 적는 목록이라, 한 세션이
//   빠뜨리면 결정이 조용히 사라진다.
//   해법은 온디맨드 도구가 아니다([ADR-06] 의례 자발 수행률 자기 레포 0%) — [TOOL-07]과 같은
//   *상시 주입 인덱스*여야 작동한다.
// read-only·zero-dep(--write 시에만 AGENTS.md 기록).
// 실행: node scripts/blocks-index.js [--write] [--json] [--contract]
const fs = require('fs');
const path = require('path');
const { withContract, OUTCOME, toShellExit } = require('./gate-contract');

const { HEAD: LEDGER, read: readLedger } = require('./ledger');
const PROPOSALS_DIR = '.union-stack/proposals';
const AGENTS = 'AGENTS.md';
const BLOCK_RE = /(<!-- blocks-index:begin[^\n]*-->)\r?\n([\s\S]*?)(<!-- blocks-index:end -->)/;
const MAX_ENTRIES = 8; // [PRO-14] §9-2. 초과는 배송 문제가 아니라 *결정이 해소되지 않는* 신호 → CLARIFY.

// 계약 선언([PRO-11] — [GRAM-12c] 꼴).
const CONTRACT = {
  gate: 'Blocks Index Gate (blocks-index)',
  input: 'archive_ledger.md + proposals/PRO-*.md 중 blocks: 필드를 가진 항목',
  predicate: 'AGENTS.md 마커 블록이 소스와 일치하고 항목 수가 상한 이내',
  scope: '표식의 존재·동기화만 본다 — 차단이 *타당한지*, 재제안이 실제로 일어났는지는 판정하지 않는다',
  outcomes: ['PASS', 'CLARIFY'],
  failure_mode: '드리프트/상한 초과를 stderr로 표면화하고 CLARIFY(3) — 흐름을 막지 않는다',
};

const ID_RE = /\[([A-Z]{2,6}-[0-9A-Za-z]+)\]/g;
const BLOCKS_RE = /blocks: *["“]([^"”]+)["”]/;
const REOPEN_RE = /reopen_when: *["“]([^"”]+)["”]/;

/**
 * 펜스 코드블록(```) 안의 줄을 지운 줄 배열(순수).
 * ⚠ 존재 이유: [ADR-07] — 자기 도메인 용어를 다루는 레포에서 문자열 매칭 계측은 **항상**
 *   자기 언급에 오염된다. 실측 재현: [PRO-14] §3의 *가공 예시* 표식이 실제 항목으로 집계됐다.
 */
function stripFences(txt) {
  let fenced = false;
  return String(txt || '').split(/\r?\n/).map(l => {
    if (/^\s*```/.test(l)) { fenced = !fenced; return ''; }
    if (fenced) return '';
    return l.replace(/`[^`]*`/g, ''); // 인라인 코드 스팬도 인용이지 표식이 아니다(3겹째)
  });
}

/**
 * 텍스트 → 차단 항목 목록(순수). 한 줄에 `blocks: "..."` 가 있으면 한 항목.
 * id는 그 줄의 마지막 `[ID]` 토큰, 없으면 fallbackId(파일 frontmatter의 id).
 * reopen_when은 같은 줄에서 읽는다(한 줄 = 한 항목 — 인덱스는 1줄/건이 계약).
 * 펜스 코드블록은 스캔하지 않는다(위 stripFences 근거).
 */
function extractBlocks(txt, fallbackId = null) {
  const out = [];
  for (const raw of stripFences(txt)) {
    const b = raw.match(BLOCKS_RE);
    if (!b) continue;
    const before = raw.slice(0, raw.indexOf('blocks:'));
    const ids = [...before.matchAll(ID_RE)].map(m => m[1]);
    const id = ids.length ? ids[ids.length - 1] : fallbackId;
    if (!id) continue; // 귀속 불가한 표식은 버린다(잘못된 ID로 인덱스를 오염시키지 않는다)
    const r = raw.match(REOPEN_RE);
    out.push({ id, blocks: b[1].trim(), reopen_when: r ? r[1].trim() : null });
  }
  return out;
}

/** frontmatter의 id: (순수). 없으면 null. */
function frontmatterId(txt) {
  const fm = String(txt || '').match(/^(?:\s|<!--[\s\S]*?-->)*---\r?\n([\s\S]*?)\r?\n---/);
  const m = fm && fm[1].match(/^\s*id:\s*(\S+)\s*$/m);
  return m ? m[1] : null;
}

/** 항목 목록 → 인덱스 본문(순수, id 정렬 — 한 항목 = 한 줄). */
function buildIndex(items) {
  return items
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(i => `- ⛔ **[${i.id}]** ${i.blocks}` + (i.reopen_when ? ` — 재개 조건: ${i.reopen_when}` : ' — 재개 조건 미기입'))
    .join('\n');
}

/** AGENTS 텍스트의 마커 블록에 주입(순수). 마커 없으면 null. 개행은 파일의 지배적 EOL을 따른다. */
function inject(agentsTxt, index) {
  if (!BLOCK_RE.test(agentsTxt)) return null;
  const eol = (agentsTxt.match(/\r\n/g) || []).length > (agentsTxt.match(/(?<!\r)\n/g) || []).length ? '\r\n' : '\n';
  const body = (index || '- (없음)').split('\n').join(eol);
  return agentsTxt.replace(BLOCK_RE, (_, b, __, e) => `${b}${eol}${body}${eol}${e}`);
}

function gather(root = path.resolve(__dirname, '..')) {
  const items = [];
  // 머리 + 회전본을 함께 읽는다([PRO-18] §3-3) — 실측상 안 읽으면 차단 표식이 6건에서 0건이 되고,
  // 이어지는 평소의 `--write` 가 AGENTS.md 의 ⛔ 블록을 `(없음)` 으로 덮어쓴다.
  items.push(...extractBlocks(readLedger(root)));
  const pdir = path.join(root, PROPOSALS_DIR);
  if (fs.existsSync(pdir)) {
    for (const e of fs.readdirSync(pdir)) {
      if (!e.endsWith('.md') || /_GUIDE\.md$/.test(e)) continue;
      const txt = fs.readFileSync(path.join(pdir, e), 'utf8');
      // 제안은 **frontmatter만** 본다 — 본문은 제안을 *서술*하는 산문이라 예시 표식이 섞인다([ADR-07] 2중 방어).
      const fm = txt.match(/^(?:\s|<!--[\s\S]*?-->)*---\r?\n([\s\S]*?)\r?\n---/);
      if (fm) items.push(...extractBlocks(fm[1], frontmatterId(txt)));
    }
  }
  return items;
}

function run(argv = process.argv.slice(2), root = path.resolve(__dirname, '..')) {
  const items = gather(root);
  if (argv.includes('--json')) { console.log(JSON.stringify(items, null, 2)); return OUTCOME.PASS; }

  const agentsPath = path.join(root, AGENTS);
  const current = fs.readFileSync(agentsPath, 'utf8');
  const expected = inject(current, buildIndex(items));
  if (expected === null) {
    console.error('blocks-index: AGENTS.md에 마커 블록(<!-- blocks-index:begin/end -->)이 없음 — 블록을 먼저 추가하라.');
    return OUTCOME.CLARIFY;
  }

  let outcome = OUTCOME.PASS;
  if (items.length > MAX_ENTRIES) {
    console.error(`blocks-index: 차단 표식 ${items.length}건 > 상한 ${MAX_ENTRIES}건 — 배송이 아니라 *해소*의 문제다.`);
    console.error('  reopen_when 조건이 충족된 항목을 해제하거나, 전략적 항목은 project/HISTORY.md로 승격하라([PRO-14] §6).');
    outcome = OUTCOME.CLARIFY;
  }
  const noReason = items.filter(i => !i.reopen_when).map(i => i.id);
  if (noReason.length) {
    console.error(`blocks-index: reopen_when 미기입 — ${noReason.join(', ')}`);
    console.error('  되돌릴 조건이 없는 결정은 결정이 아니라 도그마다([PRO-14] §5).');
    outcome = OUTCOME.CLARIFY;
  }

  if (argv.includes('--write')) {
    if (expected !== current) { fs.writeFileSync(agentsPath, expected); console.log('blocks-index: AGENTS.md 인덱스 블록 갱신.'); }
    else console.log('blocks-index: 이미 최신.');
    return outcome;
  }
  if (expected !== current) {
    console.error('blocks-index: AGENTS.md 인덱스가 소스와 불일치(드리프트) — `node scripts/blocks-index.js --write` 실행.');
    return OUTCOME.CLARIFY;
  }
  if (outcome === OUTCOME.PASS) console.log(`blocks-index 통과: 차단 표식 ${items.length}건, 인덱스 동기화됨.`);
  return outcome;
}

/**
 * 원장 실행(row) 파싱(순수) — 시간축 페이지가 소비한다. 앵커 규칙은 ref-linter 의 행 정본과
 * 동일하다(`- [날짜][ADR-N]:` 실행만 — 예시 행·본문 언급·하위 메타 행은 앵커가 아니다).
 * 반환: [{date, id, text}] — text 는 첫 문장 요지 판단을 소비자에 맡기고 원문 그대로 둔다.
 */
function parseLedger(txt) {
  const out = [];
  const re = /^- \[(\d{4}-\d{2}-\d{2})\]\[(ADR-\d+)\]: (.*)$/gm;
  let m;
  while ((m = re.exec(String(txt || ''))) !== null) out.push({ date: m[1], id: m[2], text: m[3] });
  return out;
}

module.exports = {
  parseLedger, stripFences, extractBlocks, frontmatterId, buildIndex, inject, gather, CONTRACT, MAX_ENTRIES };

if (require.main === module) process.exit(toShellExit(withContract(CONTRACT, run)()));
