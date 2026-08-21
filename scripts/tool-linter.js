#!/usr/bin/env node
// scripts/tool-linter.js
// tools 평면 드리프트 게이트(Fail-close) — [PRO-08].
// 규율(reference/tools/_GUIDE.md): "실체가 존재할 때만 등재" — 카탈로그(TOOL-*)의 `impl:` 경로가
// 레포에 실존해야 한다. 깨진 포인터는 카탈로그↔코드 드리프트이며, 주입 컨텍스트를 오염시킨다.
// read-only·zero-dep. 실행: node scripts/tool-linter.js  (tools/ 없거나 비어 있으면 no-op 통과)
const fs = require('fs');
const path = require('path');

const TOOLS_DIR = '.union-stack/reference/tools';
// 외부 채택(adopt) 자산의 impl 형식 — 레포 파일 실존 검사를 대신해 형식만 강제.
//   npx:<pkg> = 외부 npm CLI, https://... = 외부 레퍼런스(MCP 서버·저장소)
const EXTERNAL_RE = /^(npx:\S+|https?:\/\/\S+)$/;

/** frontmatter(선두 --- 블록)에서 impl 값 추출(순수). 없으면 null. */
function readImpl(txt) {
  const fm = String(txt || '').match(/^(?:\s|<!--[\s\S]*?-->)*---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return null;
  const m = fm[1].match(/^\s*impl:\s*(\S+)/m);
  return m ? m[1].trim() : null;
}

/**
 * 카드 목록 → 위반 목록(순수, FS 비의존 → 테스트 용이).
 * cards: [{file, impl, implExists}] — impl=null이면 필드 누락.
 */
function findViolations(cards) {
  const v = [];
  for (const c of cards) {
    if (!c.impl) v.push({ file: c.file, msg: 'frontmatter에 impl: 없음(실체 포인터 필수)' });
    else if (!c.implExists) v.push({ file: c.file, msg: `impl 경로가 실존하지 않음: ${c.impl}` });
  }
  return v;
}

function gather(root = path.resolve(__dirname, '..')) {
  const abs = path.join(root, TOOLS_DIR);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs)
    .filter(e => e.endsWith('.md') && !/_GUIDE\.md$/.test(e))
    .map(e => {
      let impl = null;
      try { impl = readImpl(fs.readFileSync(path.join(abs, e), 'utf8')); } catch { /* 읽기 실패 → impl 누락으로 취급 */ }
      const external = impl ? EXTERNAL_RE.test(impl) : false;
      return { file: `${TOOLS_DIR}/${e}`, impl, implExists: impl ? (external || fs.existsSync(path.join(root, impl))) : false };
    });
}

function run(root) {
  const cards = gather(root);
  if (cards.length === 0) { console.log('tool 린터: TOOL-* 카드 없음 — 건너뜀.'); return 0; }
  const violations = findViolations(cards);
  if (violations.length) {
    console.error('\n[tool 린터] 카탈로그↔실체 드리프트:');
    violations.forEach(x => console.error(`  ✗ ${x.file} — ${x.msg}`));
    console.error('\n실체를 먼저 만들고 등재하라(reference/tools/_GUIDE.md). 삭제된 도구는 카드를 함께 정리.\n');
    return 1;
  }
  console.log(`tool 린터 통과: ${cards.length}개 카드의 impl 포인터 전부 실존.`);
  return 0;
}

module.exports = { readImpl, findViolations, gather, TOOLS_DIR, EXTERNAL_RE };

if (require.main === module) process.exit(run());
