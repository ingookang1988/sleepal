#!/usr/bin/env node
// scripts/tools-index.js
// TOOL 카탈로그의 *상시 주입 인덱스* 컴파일러 — [PRO-08] 1단계.
// 근거: 온디맨드 로딩은 미호출로 죽는다(Vercel 실측: 스킬 56% 미호출·79% vs 상시 인덱스 100%).
//   카탈로그는 "한 줄 요약 인덱스가 항상 보일 때"만 작동한다 → AGENTS.md의 마커 블록에 생성·주입.
//
// 실행:
//   node scripts/tools-index.js          # check(기본): AGENTS.md 블록이 카탈로그와 일치하는지(드리프트 게이트)
//   node scripts/tools-index.js --write  # AGENTS.md 마커 블록을 재생성
const fs = require('fs');
const path = require('path');

const TOOLS_DIR = '.union-stack/reference/tools';
const AGENTS = 'AGENTS.md';
const BLOCK_RE = /(<!-- tools-index:begin[^\n]*-->)\r?\n([\s\S]*?)(<!-- tools-index:end -->)/;

/** 카드 텍스트 → {id,title,kind,impl,purpose} (순수). frontmatter 없거나 필드 부족 시 null. */
function parseCard(txt) {
  const fm = String(txt || '').match(/^(?:\s|<!--[\s\S]*?-->)*---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return null;
  const f = k => { const m = fm[1].match(new RegExp(`^\\s*${k}:\\s*(.+?)\\s*$`, 'm')); return m ? m[1].replace(/\s+#.*$/, '').trim() : null; };
  const id = f('id'), title = f('title'), kind = f('kind'), impl = f('impl');
  if (!id || !title || !impl) return null;
  // 용도 = "## 용도" 절의 첫 비어있지 않은 줄(한 줄 계약)
  const body = String(txt).slice(String(txt).indexOf('---', String(txt).indexOf('---') + 3));
  const p = body.match(/^##\s*용도\s*\r?\n+([^\r\n]+)/m);
  return { id, title, kind: kind || '?', impl, purpose: p ? p[1].trim() : '' };
}

/** 카드 목록 → 인덱스 본문(순수, id 정렬 — 한 도구 = 한 줄). */
function buildIndex(cards) {
  return cards
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(c => `- **[${c.id}]** ${c.title} — ${c.purpose} (\`${c.impl}\`)`)
    .join('\n');
}

/**
 * AGENTS 텍스트의 마커 블록에 인덱스 주입(순수). 마커 없으면 null.
 * 블록은 **파일의 지배적 개행**을 따른다 — LF로 고정 주입하면 CRLF 레포에서 다른 도구가 파일을
 * 정규화할 때마다 check가 오탐(거짓 Fail-close)한다.
 */
function inject(agentsTxt, index) {
  if (!BLOCK_RE.test(agentsTxt)) return null;
  const eol = (agentsTxt.match(/\r\n/g) || []).length > (agentsTxt.match(/(?<!\r)\n/g) || []).length ? '\r\n' : '\n';
  const body = index.split('\n').join(eol);
  return agentsTxt.replace(BLOCK_RE, (_, b, __, e) => `${b}${eol}${body}${eol}${e}`);
}

function gather(root = path.resolve(__dirname, '..')) {
  const abs = path.join(root, TOOLS_DIR);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs)
    .filter(e => e.endsWith('.md') && !/_GUIDE\.md$/.test(e))
    .map(e => { try { return parseCard(fs.readFileSync(path.join(abs, e), 'utf8')); } catch { return null; } })
    .filter(Boolean);
}

function run(argv = process.argv.slice(2), root = path.resolve(__dirname, '..')) {
  const write = argv.includes('--write');
  const agentsPath = path.join(root, AGENTS);
  const current = fs.readFileSync(agentsPath, 'utf8');
  const expected = inject(current, buildIndex(gather(root)));
  if (expected === null) {
    console.error('tools-index: AGENTS.md에 마커 블록(<!-- tools-index:begin/end -->)이 없음 — 블록을 먼저 추가하라.');
    return 1;
  }
  if (write) {
    if (expected !== current) { fs.writeFileSync(agentsPath, expected); console.log('tools-index: AGENTS.md 인덱스 블록 갱신.'); }
    else console.log('tools-index: 이미 최신.');
    return 0;
  }
  if (expected !== current) {
    console.error('tools-index: AGENTS.md 인덱스가 카탈로그와 불일치(드리프트) — `node scripts/tools-index.js --write` 실행.');
    return 1;
  }
  console.log('tools-index 통과: 인덱스가 카탈로그와 일치.');
  return 0;
}

module.exports = { parseCard, buildIndex, inject, gather, TOOLS_DIR };

if (require.main === module) process.exit(run());
