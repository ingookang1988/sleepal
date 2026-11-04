#!/usr/bin/env node
// scripts/test-catalog.js
// 테스트 호출 자산 카탈로그의 *생성 뷰* 컴파일러 — [PRO-21] 2단계, [TOOL-28].
// 근거: §5.6 "낡은 카탈로그는 중복을 유발한다" — 수기 카탈로그는 만드는 순간부터 썩는다.
//   코드가 진실이고 카탈로그는 그 투영이므로, 자산의 정의 지점에 태그를 달고 스크립트가
//   CON-00 의 마커 블록으로 추출한다(추출이 곧 동기화). `tools-index`·`blocks-index` 와
//   같은 문법: check(기본) = 드리프트 게이트(CLARIFY, 비차단) · --write = 블록 재생성.
//   블록 쓰기는 Schema 편집이다 — 커밋은 `Approved-by: GRANT-03` 을 인용한다([PRO-09] (b)).
//
// 태그 규약(자산 정의 지점의 줄 시작 주석 1줄):  이름 · ` :: ` 구분자 · 호출법.
//   자기언급 오염 방어([ADR-19]): 줄 *시작*의 주석만 태그다 — 산문 속 인용, 문자열/픽스처
//   내부("'" 뒤), 이 파일의 정규식 정의는 매치되지 않는다. .md 는 아예 스캔하지 않는다.
//
// read-only·zero-dep(--write 시에만 CON-00 기록).
// 실행: node scripts/test-catalog.js [--write] [--json] [--contract]
const fs = require('fs');
const path = require('path');
const { withContract, OUTCOME } = require('./gate-contract');

const CATALOG = '.union-stack/reference/contracts/CON-00_test_infra_catalog.md';
const SCRIPTS_DIR = 'scripts';
const BLOCK_RE = /(<!-- test-catalog:begin[^\n]*-->)\r?\n([\s\S]*?)(<!-- test-catalog:end -->)/;
const TAG_RE = /^[ \t]*\/\/ @test-asset[ \t]+(.+?)[ \t]+::[ \t]+(.+)$/;

// 계약 선언([PRO-11] — [GRAM-12c] 꼴).
const CONTRACT = {
  gate: 'Test Catalog Gate (test-catalog)',
  input: 'scripts/*.js 의 @test-asset 태그 + CON-00 마커 블록',
  predicate: 'CON-00 의 생성 블록이 코드의 태그 집합과 일치한다',
  scope: '태그의 존재·동기화만 본다 — 자산의 품질이나 실제 재사용 여부는 판정하지 않는다',
  outcomes: ['PASS', 'CLARIFY'],
  failure_mode: '드리프트/블록 부재를 stderr 로 표면화하고 CLARIFY(3) — 흐름을 막지 않는다. 카탈로그 파일 부재(어답터 미작성)는 INFO 로 PASS([ADR-28] 문법)',
};

/** 파일 텍스트 → 태그 목록(순수). relPath 는 표의 "어디" 열이 된다. */
function extractTags(txt, relPath) {
  const out = [];
  for (const line of String(txt || '').split(/\r?\n/)) {
    const m = line.match(TAG_RE);
    if (m) out.push({ asset: m[1].trim(), file: relPath, usage: m[2].trim() });
  }
  return out;
}

/** 태그 목록 → 표 본문(순수, 파일→자산명 정렬 — 한 자산 = 한 행). */
function buildTable(assets) {
  const rows = assets
    .filter(Boolean)
    .sort((a, b) => a.file.localeCompare(b.file) || a.asset.localeCompare(b.asset))
    .map(a => `| ${a.asset} | \`${a.file}\` | ${a.usage} |`);
  return ['| 자산 | 경로(어디) | 호출법(어떻게) |', '|---|---|---|', ...rows].join('\n');
}

/** 카탈로그 텍스트의 마커 블록에 표 주입(순수). 마커 없으면 null. 지배적 EOL 을 따른다. */
function inject(catalogTxt, table) {
  if (!BLOCK_RE.test(catalogTxt)) return null;
  const eol = (catalogTxt.match(/\r\n/g) || []).length > (catalogTxt.match(/(?<!\r)\n/g) || []).length ? '\r\n' : '\n';
  const body = table.split('\n').join(eol);
  return catalogTxt.replace(BLOCK_RE, (_, b, __, e) => `${b}${eol}${body}${eol}${e}`);
}

function gather(root = path.resolve(__dirname, '..')) {
  const dir = path.join(root, SCRIPTS_DIR);
  const out = [];
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith('.js')) continue;
    let txt = '';
    try { txt = fs.readFileSync(path.join(dir, f), 'utf8'); } catch { continue; }
    out.push(...extractTags(txt, `${SCRIPTS_DIR}/${f}`));
  }
  return out;
}

function run(argv = process.argv.slice(2), root = path.resolve(__dirname, '..')) {
  const assets = gather(root);
  if (argv.includes('--json')) { console.log(JSON.stringify(assets, null, 2)); return OUTCOME.PASS; }

  const catalogPath = path.join(root, CATALOG);
  // 어답터는 init 후 자기 카탈로그를 새로 쓴다 — 부재는 정상이지 고장이 아니다([ADR-28]).
  if (!fs.existsSync(catalogPath)) { console.log('test-catalog: 카탈로그 문서 없음 — INFO 해당 없음(어답터 미작성).'); return OUTCOME.PASS; }
  const current = fs.readFileSync(catalogPath, 'utf8');
  const expected = inject(current, buildTable(assets));
  if (expected === null) {
    console.error(`test-catalog: ${CATALOG} 에 마커 블록(test-catalog:begin/end)이 없다 — 생성 뷰 미설치. 블록을 추가하고 --write 하라.`);
    return OUTCOME.CLARIFY;
  }
  if (argv.includes('--write')) {
    if (expected !== current) fs.writeFileSync(catalogPath, expected);
    console.log(`test-catalog: 생성 블록 갱신(자산 ${assets.length}건). 커밋은 Approved-by: GRANT-03 을 인용할 것.`);
    return OUTCOME.PASS;
  }
  if (expected !== current) {
    console.error('test-catalog: 드리프트 — 코드의 태그와 CON-00 블록이 다르다. `node scripts/test-catalog.js --write` 후 커밋에 포함하라.');
    return OUTCOME.CLARIFY;
  }
  console.log(`test-catalog 통과: 호출 자산 ${assets.length}건, 블록 동기화됨.`);
  return OUTCOME.PASS;
}

module.exports = { extractTags, buildTable, inject, gather, run, CONTRACT, TAG_RE, BLOCK_RE, CATALOG };

// CLARIFY(3)를 그대로 내보낸다 — ci.js 체인이 [PRO-11] 코드로 판정한다(비차단 단계).
if (require.main === module) process.exit(withContract(CONTRACT, run)());
