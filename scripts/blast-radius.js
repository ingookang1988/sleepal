#!/usr/bin/env node
// scripts/blast-radius.js
// 수정·삭제 안전 게이트. 대상의 모든 자손 색인, 잠금(Verifying) 노드 있으면 Fail-close.
// 로직은 query.js(순수)에 있다. 실행: node scripts/blast-radius.js PLAN-01a [--json]
const { parseId, isUpstreamRef } = require('./zfs_util');
const { buildIndex } = require('./zfs_index');
const { blastRadius } = require('./query');

const args = process.argv.slice(2);
const json = args.includes('--json');
const arg = args.find(a => !a.startsWith('--'));
if (!arg) { console.error('사용법: node scripts/blast-radius.js <ID|파일명> [--json]'); process.exit(2); }
// 상류 참조([PRO-27] ①) — 영향권은 상류 레포에서 재야 한다. 여기서는 외부 참조 INFO 로 끝낸다.
if (isUpstreamRef(arg)) {
  if (json) { console.log(JSON.stringify({ id: arg, external: true, affected: [], locked: [], blocked: false }, null, 2)); process.exit(0); }
  console.log(`# Blast Radius: ${arg}\n  INFO: 상류 참조(up:) — 로컬 색인에서 해소하지 않는 외부 참조다([PRO-27] ①). 영향권은 상류 레포에서 재라.`);
  process.exit(0);
}
const id = parseId(arg);
if (!id) { console.error(`ZFS ID를 해석할 수 없음: ${arg}`); process.exit(2); }

const r = blastRadius(id, buildIndex());
if (json) { console.log(JSON.stringify(r, null, 2)); process.exit(r.blocked ? 1 : 0); }

console.log(`# Blast Radius: ${r.id}`);
console.log(`영향권 노드 ${r.affected.length}개${r.viaContract.length ? ` (계약 소비자 ${r.viaContract.length}개 포함)` : ''}:`);
r.affected.forEach(d =>
  console.log(`  [${d.domain}-${d.id}] ${d.status || '?'}  ${d.file}${d.via ? `  ← 계약 ${d.via} 소비자` : ''}${d.viaParent ? `  ← frontmatter 부모 ${d.viaParent}` : ''}`));
if (r.externalConsumers && r.externalConsumers.length) {
  console.log(`\nINFO: 상류 참조(up:) 소비자 ${r.externalConsumers.length}건 — 로컬 해소 대상 아님([PRO-27] ①):`);
  r.externalConsumers.forEach(u => console.log(`  · ${u.ref}  ← ${u.from}`));
}
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
