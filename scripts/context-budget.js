#!/usr/bin/env node
// scripts/context-budget.js
// 부트스트랩 컨텍스트 경제학 — "가장 작은 고신호 집합"(context engineering 1원칙)을 *측정 가능*하게 만든다.
// 세션 시작 시 주입되는 정적 컨텍스트(project + 활성 profile + HANDOFF)의 토큰을 추정하고
// 단계별 예산 상한과 대조한다. 초과 시 WARN — 하네스가 막으려던 context-rot의 자가 유발을 조기 경고.
// read-only·zero-dep. 실행: node scripts/context-budget.js [--json]
//
// 한계(정직히): 실 토크나이저가 아닌 문자 기반 근사다. 단 **스크립트별 계수**를 쓴다 —
//   라틴 ~4자/토큰, 한글·CJK·가나 ~1.5자/토큰. 단일 char/4는 한국어를 2~3배 *과소평가*해
//   "예산 내"를 낙관적으로 보고했다(이 레포는 문서 다수가 한국어라 직접 영향).
const fs = require('fs');
const path = require('path');
const { load: loadAdapter } = require('./adapter');

// 단계별 예산(토큰) — 부트스트랩이 비대해지면 분할/요약/링크-위임(extreme compression) 신호.
const BUDGETS = {
  project: 2000,   // IDENTITY(경계·어휘) + HISTORY(전략 분기점)
  profile: 800,    // 활성 user + agent 선호
  handoff: 1500,   // 세션 이어달리기(최신 1개)
};
const TOTAL_CAP = 4000; // 정적 부트스트랩 총합 상한

// 스크립트별 문자/토큰 계수. CJK 계열은 현행 토크나이저에서 대략 1~2자당 1토큰이라 1.5로 잡는다.
const CJK_RE = /[가-힣ᄀ-ᇿ㄰-㆏぀-ヿ一-鿿㐀-䶿豈-﫿]/g;
const CHARS_PER_TOKEN = { cjk: 1.5, latin: 4 };

/** 거친 토큰 추정(스크립트 혼재 대응). 절대값이 아니라 추세·예산 대비를 본다. */
function estimateTokens(text) {
  const t = text || '';
  const cjk = (t.match(CJK_RE) || []).length;
  return Math.ceil(cjk / CHARS_PER_TOKEN.cjk + (t.length - cjk) / CHARS_PER_TOKEN.latin);
}

/** 유효 예산: 기본값 위에 adapter.json budgets(project·profile·handoff·total)를 덮는다([ADR-29] — 포크가 아니라 설정). */
function budgetsFor(root = path.resolve(__dirname, '..')) {
  const b = (loadAdapter(root).budgets) || {};
  return { ...BUDGETS, total: TOTAL_CAP, ...b };
}

/** 순수: 섹션별 {name, tokens, budget} → 평가 리포트. (FS 비의존 → 테스트 용이) */
function computeBudget(sections, totalCap = TOTAL_CAP) {
  const rows = sections.map(s => ({
    name: s.name, tokens: s.tokens, budget: s.budget,
    status: s.budget && s.tokens > s.budget ? 'OVER' : 'OK',
  }));
  const total = rows.reduce((a, r) => a + r.tokens, 0);
  const over = rows.filter(r => r.status === 'OVER').length + (total > totalCap ? 1 : 0);
  return { rows, total, totalCap, over, healthy: over === 0 };
}

function readIf(root, rel) {
  const p = path.join(root, rel);
  try { return fs.statSync(p).isFile() ? fs.readFileSync(p, 'utf8') : ''; } catch { return ''; }
}
// 디렉터리에서 패턴에 맞는 .md를 모아 텍스트 합산(활성 *.local.md 우선, 없으면 *_example.md).
function readDir(root, rel, match) {
  const abs = path.join(root, rel);
  let txt = '';
  try {
    const all = fs.readdirSync(abs).filter(e => e.endsWith('.md') && match.test(e));
    const local = all.filter(e => e.endsWith('.local.md'));
    (local.length ? local : all).forEach(e => { txt += readIf(root, `${rel}/${e}`); });
  } catch { /* 없음 */ }
  return txt;
}

// --- advisory: AGENTS.md 계측 + PRO `injects:` 대조([PRO-28] ⑤ 판정 2026-10-18, [WO-28a-6]) ---
// AGENTS.md 는 가장 큰 상시 주입 표면이지만 예산(게이트·상한)은 [PRO-13] §4-4 인간 판정 전이다.
// 그래서 총합·over·exit code 에 넣지 않고 수치만 보인다(회귀 0).
const MARKER_RE = /<!--\s*([\w-]+):begin[\s\S]*?<!--\s*\1:end\s*-->/g;

/** 순수: AGENTS.md 텍스트 → {tokens, markers(생성 블록 토큰), blocks} | null(없음). */
function measureAgents(text) {
  if (!text) return null;
  const blocks = text.match(MARKER_RE) || [];
  return { tokens: estimateTokens(text), markers: blocks.reduce((a, b) => a + estimateTokens(b), 0), blocks: blocks.length };
}

/** 순수: frontmatter `injects:` 값 → {tok, reason} | {error}. 형식: "+N tok — 이유". */
function parseInjects(raw) {
  const v = String(raw || '').trim().replace(/^["']|["']$/g, '').trim();
  if (!v) return { error: '빈 값' };
  const m = v.match(/^\+?(\d+)\s*tok\s*[—–-]\s*(\S.*)$/);
  return m ? { tok: Number(m[1]), reason: m[2].trim() } : { error: `형식 오류 — "+N tok — 이유" 가 아니다: ${v}` };
}

/** proposals/PRO-*.md 의 `injects:` 를 모은다. 필드 없음 = 신고 0(소급 없음). */
function gatherInjects(root = path.resolve(__dirname, '..')) {
  const rel = '.union-stack/proposals';
  const declared = [], clarify = [];
  let files = [];
  try { files = fs.readdirSync(path.join(root, rel)).filter(e => /^PRO-.*\.md$/.test(e)); } catch { /* 없음 */ }
  for (const f of files) {
    const fm = (readIf(root, `${rel}/${f}`).match(/^[\s\S]*?^---\r?\n([\s\S]*?)\r?\n---/m) || [])[1] || '';
    const line = fm.match(/^injects:[ \t]*(.*)$/m);
    if (!line) continue;
    const id = (f.match(/^(PRO-\d+[a-z]?)/) || [])[1] || f;
    const p = parseInjects(line[1]);
    (p.error ? clarify : declared).push({ id, ...p });
  }
  return { declared, clarify, sum: declared.reduce((a, d) => a + d.tok, 0) };
}

function gather(root = path.resolve(__dirname, '..')) {
  const projectTxt = readDir(root, '.union-stack/project', /^IDENTITY.*\.md$/) + readIf(root, '.union-stack/project/HISTORY.md');
  const profileTxt = readDir(root, '.union-stack/profile/human', /^(user|team|org)/) + readDir(root, '.union-stack/profile/agent', /^agent/);
  const handoffTxt = readIf(root, '.union-stack/sprint/HANDOFF.md');
  const b = budgetsFor(root);
  const r = computeBudget([
    { name: 'project', tokens: estimateTokens(projectTxt), budget: b.project },
    { name: 'profile', tokens: estimateTokens(profileTxt), budget: b.profile },
    { name: 'handoff', tokens: estimateTokens(handoffTxt), budget: b.handoff },
  ], b.total);
  r.advisory = { agents: measureAgents(readIf(root, 'AGENTS.md')), injects: gatherInjects(root) };
  return r;
}

function run(root) {
  const r = gather(root);
  if (process.argv.includes('--json')) { console.log(JSON.stringify(r, null, 2)); return r.over ? 1 : 0; }
  console.log('# union-stack context budget (정적 부트스트랩 주입)\n');
  for (const row of r.rows) {
    const mark = row.status === 'OK' ? '✓' : '!';
    console.log(`  ${mark} ${row.name.padEnd(10)} ${String(row.tokens).padStart(5)} tok  / 예산 ${row.budget}`);
  }
  const mark = r.total > r.totalCap ? '!' : '✓';
  console.log(`\n  ${mark} 총합 ${r.total} tok / 상한 ${r.totalCap}`);
  console.log(r.healthy
    ? '\n예산 내. (작업별 Upward Fetching 증분은 별도 — 계보 깊이에 비례)'
    : '\n초과 — 분할/요약/링크-위임(extreme compression)으로 고신호만 남겨라.');
  const { agents, injects } = r.advisory;
  console.log('\n# advisory (총합·판정 밖 — 예산은 [PRO-13] §4-4 인간 판정)\n');
  console.log(agents
    ? `  · AGENTS.md   ${String(agents.tokens).padStart(5)} tok  (생성 마커 블록 ${agents.blocks}개 ${agents.markers} tok)`
    : '  · AGENTS.md   없음');
  console.log(`  · injects 신고 ${injects.declared.length}건 합 +${injects.sum} tok`);
  for (const d of injects.declared) console.log(`      ${d.id}  +${d.tok} tok — ${d.reason}`);
  for (const c of injects.clarify) console.log(`  ? ${c.id} injects: ${c.error}`);
  return r.over ? 1 : 0;
}

module.exports = { estimateTokens, computeBudget, gather, budgetsFor, measureAgents, parseInjects, gatherInjects, BUDGETS, TOTAL_CAP, CHARS_PER_TOKEN };

if (require.main === module) process.exit(run());
