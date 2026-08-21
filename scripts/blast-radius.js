#!/usr/bin/env node
// scripts/blast-radius.js
// 수정·삭제 안전 게이트. 대상의 모든 자손 색인, 잠금(Verifying) 노드 있으면 Fail-close.
// 로직은 query.js(순수)에 있다. 실행: node scripts/blast-radius.js PLAN-01a [--json]
const { parseId } = require('./zfs_util');
const { buildIndex } = require('./zfs_index');
const { blastRadius } = require('./query');

const args = process.argv.slice(2);
const json = args.includes('--json');
const arg = args.find(a => !a.startsWith('--'));
if (!arg) { console.error('사용법: node scripts/blast-radius.js <ID|파일명> [--json]'); process.exit(2); }
const id = parseId(arg);
if (!id) { console.error(`ZFS ID를 해석할 수 없음: ${arg}`); process.exit(2); }

const r = blastRadius(id, buildIndex());
if (json) { console.log(JSON.stringify(r, null, 2)); process.exit(r.blocked ? 1 : 0); }

console.log(`# Blast Radius: ${r.id}`);
console.log(`영향권 노드 ${r.affected.length}개${r.viaContract.length ? ` (계약 소비자 ${r.viaContract.length}개 포함)` : ''}:`);
r.affected.forEach(d =>
  console.log(`  [${d.domain}-${d.id}] ${d.status || '?'}  ${d.file}${d.via ? `  ← 계약 ${d.via} 소비자` : ''}`));
if (r.unresolvedConsumers.length) {
  console.error(`\n미해소 consumers ${r.unresolvedConsumers.length}건 — 오타면 고치고, 아직 없는 문서면 만들 것:`);
  r.unresolvedConsumers.forEach(u => console.error(`  ? ${u.ref}  ← ${u.from}`));
}
if (r.blocked) {
  console.error('\nFail-close: 잠금 상태(Verifying) 노드가 영향권에 있음 — 변경 보류.');
  r.locked.forEach(d => console.error(`  ✗ [${d.domain}-${d.id}] ${d.status}  ${d.file}`));
  console.error('인간 확인 후 진행하세요.');
  process.exit(1);
}
console.log('\n잠금 상태 노드 없음 — 변경 가능.');
process.exit(0);
