#!/usr/bin/env node
// scripts/hook-userprompt.js
// Claude Code UserPromptSubmit 훅 어댑터. 프롬프트에 ZFS 작업 ID가 보이면 Upward Fetching 결과를
// stdout으로 출력한다 — UserPromptSubmit 훅의 stdout(exit 0)은 그대로 에이전트 컨텍스트에 주입된다.
// 이로써 "코드 작성 전 부모 맥락+과거 실패를 먼저 읽어라"는 의례가 *자동*으로 선주입된다(가시성 → 강제).
const fs = require('fs');
const { buildIndex } = require('./zfs_index');
const { upwardFetch } = require('./query');
const { extractWorkId } = require('./hooks');

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function main() {
  let input = {};
  try { input = JSON.parse(readStdin() || '{}'); } catch { return 0; }
  const id = extractWorkId(input.prompt || '');
  if (!id) return 0; // 작업 ID 없는 일반 대화 → 무간섭
  const r = upwardFetch(id, buildIndex(process.cwd()));
  if (!r.context.length && !r.lessons.length) return 0; // 끌어올 맥락 없음 → 노이즈 방지
  const lines = [`[union-stack] ${id} 작업 진입 맥락 (계보 ${r.chain.join('→')}):`];
  if (r.context.length) {
    lines.push('  공간(부모 PLAN/FLOW/CON/ARCH/MTG):');
    r.context.forEach(d => lines.push(`    [${d.domain}-${d.id}] ${d.file}`));
  }
  if (r.lessons.length) {
    lines.push('  시간축 경고(같은 계보 LSN — 과거 반복 실패, 코드 전에 확인):');
    r.lessons.forEach(d => lines.push(`    ⚠ [${d.domain}-${d.id}] ${d.file}`));
  }
  console.log(lines.join('\n'));
  return 0;
}

process.exit(main());
