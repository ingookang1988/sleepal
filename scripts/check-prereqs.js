#!/usr/bin/env node
// scripts/check-prereqs.js
// 단계 진입 전 필수 산출물 게이트(Fail-close) — [PRO-08] 2단계, Spec Kit check-prerequisites 패턴.
// 검사:
//   (항상)  부트스트랩 산출물 — project/IDENTITY* 존재, sprint/HANDOFF.md 존재 + 필수 5부 헤딩.
//   (ID 시) 계보 전거 — upward-fetch 맥락(PLAN/CON/ARCH/FLOW/MTG)이 1개 이상. 0이면 "기획 없는 구현 진입".
// 실행: node scripts/check-prereqs.js [<WORK_ID>] [--json]
const fs = require('fs');
const path = require('path');
const { parseId } = require('./zfs_util');
const { buildIndex } = require('./zfs_index');
const { upwardFetch } = require('./query');

/** 부트스트랩 산출물 검사(순수). 반환: 위반 목록. */
function checkArtifacts({ identityExists, handoffTxt }) {
  const v = [];
  if (!identityExists) v.push({ code: 'identity', msg: 'project/IDENTITY*.md 없음 — 정체성 없이 작업 진입 불가(init 또는 IDENTITY 작성)' });
  if (handoffTxt == null) v.push({ code: 'handoff', msg: 'sprint/HANDOFF.md 없음 — 직전 세션 이어달리기 불가' });
  else {
    const parts = new Set((handoffTxt.match(/^##\s*([1-5])\./gm) || []).map(h => h.match(/([1-5])/)[1]));
    if (parts.size < 5) v.push({ code: 'handoff-parts', msg: `HANDOFF 필수 5부 중 ${parts.size}부만 존재(요약·변경위치·다음작업·미해결·검증상태)` });
  }
  return v;
}

/** 계보 전거 검사(순수). fetch = upwardFetch 결과. */
function checkLineage(fetch) {
  if (!fetch) return [];
  if (fetch.context.length === 0) {
    return [{ code: 'lineage', msg: `계보 ${fetch.id}에 전거 문서(PLAN/CON/ARCH/FLOW/MTG) 0개 — 구현 전 PLAN을 먼저 쓰거나, 탐색이면 spike/로` }];
  }
  return [];
}

function gather(root = path.resolve(__dirname, '..'), workId = null) {
  const idDir = path.join(root, '.union-stack', 'project');
  let identityExists = false;
  try { identityExists = fs.readdirSync(idDir).some(e => /^IDENTITY.*\.md$/.test(e)); } catch { /* 없음 */ }
  let handoffTxt = null;
  try { handoffTxt = fs.readFileSync(path.join(root, '.union-stack', 'sprint', 'HANDOFF.md'), 'utf8'); } catch { /* 없음 */ }
  const fetch = workId ? upwardFetch(workId, buildIndex(root)) : null;
  return { identityExists, handoffTxt, fetch };
}

function run(argv = process.argv.slice(2), root) {
  const json = argv.includes('--json');
  const idArg = argv.find(a => !a.startsWith('--')) || null;
  const workId = idArg ? parseId(idArg) : null;
  if (idArg && !workId) { console.error(`check-prereqs: 유효하지 않은 ID: ${idArg}`); return 2; }
  const g = gather(root, workId);
  const violations = [...checkArtifacts(g), ...checkLineage(g.fetch)];
  if (json) { console.log(JSON.stringify({ workId, violations }, null, 2)); return violations.length ? 1 : 0; }
  if (violations.length) {
    console.error('\n[check-prereqs] 진입 전제 미충족(Fail-close):');
    violations.forEach(x => console.error(`  ✗ (${x.code}) ${x.msg}`));
    return 1;
  }
  console.log(`check-prereqs 통과: 부트스트랩 산출물 OK${workId ? ` + 계보 ${workId} 전거 ${g.fetch.context.length}건` : ''}.`);
  return 0;
}

module.exports = { checkArtifacts, checkLineage, gather };

if (require.main === module) process.exit(run());
