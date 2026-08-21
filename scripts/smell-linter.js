#!/usr/bin/env node
// scripts/smell-linter.js
// TOOL 카드 품질 린터(Fail-close) — [PRO-08] 2단계.
// 근거: 실측상 공개 SKILL.md의 99%+가 "skill smell"을 갖는다(arXiv 2607.01456 — 과소/과잉 명세·
//   안전장치 누락·컨텍스트 비대). 카탈로그의 가치는 큐레이션이므로, 카드가 사용 계약의
//   최소 해부(용도·부정 스코프·호출)를 갖추고 비대하지 않음을 기계로 강제한다.
// read-only·zero-dep. 실행: node scripts/smell-linter.js [--json]
const fs = require('fs');
const path = require('path');
const { estimateTokens } = require('./context-budget');

const TOOLS_DIR = '.union-stack/reference/tools';
const MAX_CHARS = 4000; // 카드는 주입 컨텍스트 — 비대는 그 자체로 smell

// --- 시나리오(kind: scenario) 추가 규율 — [PRO-10] ---
// 근거: 간결 스킬 +18.9pp vs 포괄 문서 +5.7pp(약 4배) → 본문 상한.
//   페르소나 프레이밍은 null~부정이고 *코딩이 최악 피해 범주* → roleDefinition 금지.
//   증거 없는 승격 금지(모든 레지스트리가 형식만 검사하고 효능을 링크하지 않는 공백을 메운다).
const SCENARIO_MAX_TOKENS = 1500;
const SCENARIO_FIELDS = ['version', 'status', 'activation', 'entry_gate', 'exit_criteria', 'reviewed', 'evidence'];
const SCENARIO_SECTIONS = [['절차', 'no-procedure'], ['종료 조건', 'no-exit-criteria']];

/**
 * 카드 텍스트 → smell 목록(순수).
 * opts.impl: kind=scenario일 때 {tokens, text} — 스킬 본문. 절차·종료조건은 **카드가 아니라 본문**에서
 *   검사한다(카드에 절차를 복제하면 카탈로그-only 원칙을 깨고 상시 인덱스를 부풀린다).
 */
function findSmells(txt, opts = {}) {
  const s = [];
  const t = String(txt || '');
  if (!/^##\s*용도\s*$/m.test(t)) s.push({ code: 'no-purpose', msg: '"## 용도" 절 없음(과소 명세)' });
  if (!/^##\s*언제 쓰지 않나\s*$/m.test(t)) s.push({ code: 'no-negative-scope', msg: '"## 언제 쓰지 않나" 절 없음(안전장치/부정 스코프 누락)' });
  if (!/^##\s*호출\s*$/m.test(t)) s.push({ code: 'no-invocation', msg: '"## 호출" 절 없음(실행 계약 부재)' });
  const fm = t.match(/^(?:\s|<!--[\s\S]*?-->)*---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm || !/^\s*kind:\s*\S/m.test(fm[1])) s.push({ code: 'no-kind', msg: 'frontmatter에 kind: 없음(script|skill|mcp|cli|scenario)' });
  // 크기는 **LF 정규화 후** 잰다. CRLF 작업트리에서는 줄마다 1바이트가 더 붙어, 같은 커밋이
  // 체크아웃 EOL 에 따라 통과/차단으로 갈린다(실측: 상한 근처 카드가 Windows 에서만 REJECT).
  // 개행 표현은 컨텍스트 내용이 아니다 — template-update 의 gitBlobShas 와 같은 정규화 문법.
  const chars = t.replace(/\r\n/g, '\n').length;
  if (chars > MAX_CHARS) s.push({ code: 'bloat', msg: `카드 ${chars}자 > ${MAX_CHARS}자(컨텍스트 비대 — 상세는 impl 쪽 문서로)` });

  if (fm && /^\s*kind:\s*scenario\s*$/m.test(fm[1])) {
    for (const f of SCENARIO_FIELDS) {
      if (!new RegExp(`^\\s*${f}:`, 'm').test(fm[1])) s.push({ code: `no-${f}`, msg: `시나리오 필수 필드 없음: ${f}:` });
    }
    const body = opts.impl && typeof opts.impl.text === 'string' ? opts.impl.text : null;
    if (body !== null) {
      for (const [sec, code] of SCENARIO_SECTIONS) {
        if (!new RegExp(`^##\\s*${sec}\\s*$`, 'm').test(body)) s.push({ code, msg: `스킬 본문에 필수 절 없음: "## ${sec}" (${'impl'})` });
      }
    }
    if (/^\s*roleDefinition:/m.test(fm[1])) {
      s.push({ code: 'persona-framing', msg: 'roleDefinition 금지 — 페르소나 프레이밍은 코딩에서 최악 피해(측정)' });
    }
    // 증거 없는 Active 금지: evidence가 빈 배열인데 status가 Active면 승격 근거가 없다.
    if (/^\s*status:\s*Active\s*$/m.test(fm[1]) && /^\s*evidence:\s*\[\s*\]\s*$/m.test(fm[1])) {
      s.push({ code: 'unevidenced-active', msg: 'status: Active인데 evidence[]가 빔 — A/B 근거 없이 승격 불가(Draft로 두라)' });
    }
    const tok = opts.impl && opts.impl.tokens;
    if (typeof tok === 'number' && tok > SCENARIO_MAX_TOKENS) {
      s.push({ code: 'scenario-bloat', msg: `절차 본문 ~${tok} tok > ${SCENARIO_MAX_TOKENS} tok(간결이 포괄을 약 4배 이긴다)` });
    }
  }
  return s;
}

// 시나리오 카드의 impl(스킬 본문)을 읽어 {tokens, text} 반환. 토큰 추정은 context-budget의
// CJK 인지 추정기를 재사용한다(규칙 4 — 재발명 금지).
function readImpl(root, txt) {
  const m = txt.match(/^\s*impl:\s*(\S+)/m);
  if (!m) return null;
  try {
    const text = fs.readFileSync(path.join(root, m[1]), 'utf8');
    return { tokens: estimateTokens(text), text };
  } catch { return null; }
}

function gather(root = path.resolve(__dirname, '..')) {
  const abs = path.join(root, TOOLS_DIR);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs)
    .filter(e => e.endsWith('.md') && !/_GUIDE\.md$/.test(e))
    .map(e => {
      let txt = ''; try { txt = fs.readFileSync(path.join(abs, e), 'utf8'); } catch { /* 읽기 실패 → 빈 텍스트 = smell */ }
      const isScenario = /^\s*kind:\s*scenario\s*$/m.test(txt);
      return { file: `${TOOLS_DIR}/${e}`, smells: findSmells(txt, { impl: isScenario ? readImpl(root, txt) : null }) };
    });
}

function run(root) {
  const cards = gather(root);
  const json = process.argv.includes('--json');
  const bad = cards.filter(c => c.smells.length);
  if (json) { console.log(JSON.stringify({ cards: cards.length, violations: bad }, null, 2)); return bad.length ? 1 : 0; }
  if (cards.length === 0) { console.log('smell 린터: TOOL-* 카드 없음 — 건너뜀.'); return 0; }
  if (bad.length) {
    console.error('\n[smell 린터] 사용 계약 해부 미달 카드:');
    bad.forEach(c => c.smells.forEach(x => console.error(`  ✗ ${c.file} — (${x.code}) ${x.msg}`)));
    console.error('\n카드 해부: 용도 / 언제 쓰나 / 언제 쓰지 않나 / 호출 (reference/tools/_GUIDE.md).\n');
    return 1;
  }
  console.log(`smell 린터 통과: ${cards.length}개 카드 전부 사용 계약 해부 충족.`);
  return 0;
}

module.exports = { findSmells, gather, MAX_CHARS, SCENARIO_MAX_TOKENS, SCENARIO_FIELDS };

if (require.main === module) process.exit(run());
