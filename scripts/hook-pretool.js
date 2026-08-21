#!/usr/bin/env node
// scripts/hook-pretool.js
// Claude Code PreToolUse 훅 어댑터(Edit|Write|MultiEdit). stdin으로 도구 입력 JSON을 받아
// hooks.decideEdit 로 판정한다. 차단 시 exit 2(+stderr 사유) → 도구 호출이 막히고 사유가 에이전트에 전달된다.
// 모드: 환경변수 UNION_STACK_HOOK = warn(기본) | enforce | off.
const fs = require('fs');
const { buildIndex } = require('./zfs_index');
const { decideEdit } = require('./hooks');

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function main() {
  let input = {};
  try { input = JSON.parse(readStdin() || '{}'); } catch { /* 입력 없음 → 무간섭 */ }
  const file = input?.tool_input?.file_path;
  if (!file) return 0; // 파일 경로 없는 도구(예: Bash) → 무간섭
  const mode = process.env.UNION_STACK_HOOK || 'warn';
  const root = process.cwd();
  const d = decideEdit(file, buildIndex(root), mode, root);
  if (d.block) {
    console.error('[union-stack hook] 차단 — 권한/잠금 위반:');
    d.issues.filter(i => i.block).forEach(i => console.error(`  ✗ ${i.msg}`));
    return 2; // PreToolUse: exit 2 → 도구 차단, stderr가 에이전트에 피드백된다
  }
  if (d.issues.length) {
    console.error('[union-stack hook] 주의(advisory):');
    d.issues.forEach(i => console.error(`  ! ${i.msg}`));
  }
  return 0;
}

process.exit(main());
