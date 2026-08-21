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

function gather(root = path.resolve(__dirname, '..')) {
  const projectTxt = readDir(root, '.union-stack/project', /^IDENTITY.*\.md$/) + readIf(root, '.union-stack/project/HISTORY.md');
  const profileTxt = readDir(root, '.union-stack/profile/human', /^(user|team|org)/) + readDir(root, '.union-stack/profile/agent', /^agent/);
  const handoffTxt = readIf(root, '.union-stack/sprint/HANDOFF.md');
  return computeBudget([
    { name: 'project', tokens: estimateTokens(projectTxt), budget: BUDGETS.project },
    { name: 'profile', tokens: estimateTokens(profileTxt), budget: BUDGETS.profile },
    { name: 'handoff', tokens: estimateTokens(handoffTxt), budget: BUDGETS.handoff },
  ]);
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
  return r.over ? 1 : 0;
}

module.exports = { estimateTokens, computeBudget, gather, BUDGETS, TOTAL_CAP, CHARS_PER_TOKEN };

if (require.main === module) process.exit(run());
