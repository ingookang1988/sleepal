#!/usr/bin/env node
// scripts/upstream-prefix.js
// 배포 접두([PRO-27] ①) — 상류 문서(설문 정본·키트 안내·review 파일)를 어답터로 옮길 때 모든 브래킷 ID 참조에
// `up:` 을 붙인다(`[PRO-27]` → `[up:PRO-27]`). 멱등. 로직은 ref-linter.prefixUpstreamRefs(순수)에 있다.
//
// 왜: 어답터 3곳 모두 상류 ID 와 로컬 ID 가 같은 공간이라, 접두 없는 상류 문서를 그대로 옮기면 어답터의 strict 참조
// 린터가 상류 ID 를 로컬 문서로 오해소하거나 Fail-close 한다(SURVEY-02 실측 — 설문 파일 자체가 걸렸다).
//
// 실행: node scripts/upstream-prefix.js <file>   → stdout
//       node scripts/upstream-prefix.js -        → stdin → stdout
const fs = require('fs');
const { prefixUpstreamRefs } = require('./ref-linter');

function main(argv = process.argv.slice(2)) {
  const file = argv.find(a => !a.startsWith('--'));
  if (!file) { console.error('사용법: node scripts/upstream-prefix.js <file|-> > out.md'); return 2; }
  const txt = file === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(file, 'utf8');
  process.stdout.write(prefixUpstreamRefs(txt));
  return 0;
}

module.exports = { main };

if (require.main === module) process.exit(main());
