#!/usr/bin/env node
// scripts/upward-fetch.js
// 작업 진입 의식(Upward Fetching). 부모 PLAN/FLOW/CON/ARCH/MTG + 같은 계보 LSN.
// 로직은 query.js(순수)에 있다. 실행: node scripts/upward-fetch.js WO-01a1-2 [--json]
const { parseId } = require('./zfs_util');
const { buildIndex } = require('./zfs_index');
const { upwardFetch } = require('./query');

const args = process.argv.slice(2);
const json = args.includes('--json');
const arg = args.find(a => !a.startsWith('--'));
if (!arg) { console.error('사용법: node scripts/upward-fetch.js <ID|파일명> [--json]'); process.exit(2); }
const id = parseId(arg);
if (!id) { console.error(`ZFS ID를 해석할 수 없음: ${arg}`); process.exit(2); }

const r = upwardFetch(id, buildIndex());
if (json) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }

// 비규범 배너([PRO-12]): tier:draft 문서는 주입하되 구속력 없음을 명시(기본 제외가 아님 —
// 방금 위임받아 쓴 초안이 다음 세션에 안 보이는 컨텍스트 기아를 막는다).
const banner = d => (d.tier === 'draft' ? '  ⚠ tier:draft — 비규범(구속력 없음)' : '');

console.log(`# Upward Fetching: ${r.id}`);
console.log(`계보(조상 역산): ${r.chain.join(' → ')}\n`);
console.log('## 공간 맥락 (부모 PLAN/FLOW/CON/ARCH/MTG)');
if (r.context.length) r.context.forEach(d => console.log(`  [${d.domain}-${d.id}] ${d.file}${banner(d)}`));
else console.log('  (없음)');
console.log('\n## 시간축 경고 (같은 계보의 LSN — 과거 반복 실패)');
if (r.lessons.length) r.lessons.forEach(d => console.log(`  ⚠ [${d.domain}-${d.id}] ${d.file}${banner(d)}`));
else console.log('  (없음)');
