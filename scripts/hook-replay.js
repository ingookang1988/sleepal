#!/usr/bin/env node
// scripts/hook-replay.js
// enforce 모드 경제성 사전 측정 — [E3]. 과거 *실제* 편집을 PreToolUse 결정 함수(hooks.decideEdit)에
// 재생해 "훅을 켰다면 무엇이 몇 번 막혔을까"를 훅 설치 없이 잰다.
//   차단 유형: schema(Schema-tier 편집) / lock(Blast-Radius Verifying 자손).
// 이 레포 밖 경로의 편집은 제외한다(다른 프로젝트 세션 혼입 방지).
//
// 정직한 한계: 인덱스는 *현재* 평면 상태다(편집 시점 status가 아님) — lock 수치는 근사.
//   또한 차단이 곧 오탐/정탐을 뜻하지 않는다. 이 도구는 *빈도와 대상*을 주고, 판정은 인간 몫.
// 실행: node scripts/hook-replay.js [<transcript-dir>] [--json]
const fs = require('fs');
const os = require('os');
const path = require('path');
const { toolUses } = require('./transcript-stats');
const { decideEdit } = require('./hooks');
const { buildIndex } = require('./zfs_index');
const { walkFiles } = require('./fs_walk');

const EDIT_RE = /^(Edit|Write|MultiEdit|NotebookEdit)$/;

/** 편집 경로 목록 → 재생 집계(순수 셸: decideEdit은 순수, index 주입). */
function replay(paths, index, root) {
  const stats = { edits: paths.length, blocked: 0, byKind: {}, paths: {} };
  for (const p of paths) {
    const d = decideEdit(p, index, 'enforce', root);
    if (!d.block) continue;
    stats.blocked++;
    for (const i of d.issues.filter(x => x.block)) {
      stats.byKind[i.kind] = (stats.byKind[i.kind] || 0) + 1;
      const key = `${i.kind}:${p}`;
      stats.paths[key] = (stats.paths[key] || 0) + 1;
    }
  }
  stats.blockRate = stats.edits ? +(stats.blocked / stats.edits).toFixed(3) : null;
  return stats;
}

/** 트랜스크립트에서 이 레포 안의 편집 경로만 수집. */
function gatherEdits(dir, root) {
  const out = [];
  const files = [];
  walkFiles(dir, '', rel => { if (rel.endsWith('.jsonl')) files.push(path.join(dir, rel)); });
  for (const f of files) {
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let calls = []; try { calls = toolUses(JSON.parse(line)); } catch { continue; }
      for (const c of calls) {
        if (!EDIT_RE.test(c.name)) continue;
        const fp = c.input && c.input.file_path;
        if (!fp) continue;
        const rel = path.relative(root, path.resolve(fp));
        if (rel.startsWith('..') || path.isAbsolute(rel)) continue; // 레포 밖 편집 제외
        out.push(rel.split(path.sep).join('/'));
      }
    }
  }
  return out;
}

function run(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  const root = path.resolve(__dirname, '..');
  const dir = argv.find(a => !a.startsWith('--')) || path.join(os.homedir(), '.claude', 'projects');
  const r = replay(gatherEdits(dir, root), buildIndex(root), root);
  if (json) { console.log(JSON.stringify(r, null, 2)); return 0; }
  console.log(`# hook-replay (enforce 가정) — ${dir}`);
  console.log(`  레포 내 편집 ${r.edits}건 / 차단 ${r.blocked}건 (${r.blockRate === null ? 'n/a' : Math.round(r.blockRate * 100) + '%'})`);
  console.log(`  유형별: ${Object.entries(r.byKind).map(([k, v]) => `${k}=${v}`).join(', ') || '없음'}`);
  const top = Object.entries(r.paths).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (top.length) { console.log('  차단 대상 상위(인간이 오탐/정탐 판정):'); top.forEach(([k, c]) => console.log(`    ${String(c).padStart(4)}  ${k}`)); }
  return 0;
}

module.exports = { replay, gatherEdits };

if (require.main === module) process.exit(run());
