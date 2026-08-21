#!/usr/bin/env node
// scripts/transcript-stats.js
// 세션 트랜스크립트 관측기 — [PRO-08] 2단계, "관측 주도 하네스 진화" 패턴(arXiv 2604.25850 계열).
// Claude Code 로컬 트랜스크립트(*.jsonl)에서 도구 호출을 추출해 두 가지를 잰다:
//   1. 도구 호출 빈도(무엇이 실제로 쓰이는가 — TOOL 카탈로그의 실사용 근거)
//   2. **의례 자발 수행률**(E3 지표): 편집이 있는 세션 중, 첫 편집 *이전*에
//      upward-fetch/blast-radius(CLI·MCP·슬래시 무엇이든)를 수행한 비율.
// read-only·zero-dep. 포맷 의존 최소화: 각 JSON 줄에서 {type:"tool_use", name} 객체를 재귀 탐색.
// 실행: node scripts/transcript-stats.js [<dir>] [--json]   (기본: ~/.claude/projects — 하위 1단계의 *.jsonl)
const fs = require('fs');
const os = require('os');
const path = require('path');

const EDIT_RE = /^(Edit|Write|MultiEdit|NotebookEdit)$/;
const RITUAL_RE = /upward[-_]?fetch|blast[-_]?radius/i;

/** JSON 노드에서 tool_use {name, input}를 순서대로 수집(순수, 포맷-내성). */
function toolUses(node, out = []) {
  if (Array.isArray(node)) node.forEach(n => toolUses(n, out));
  else if (node && typeof node === 'object') {
    if (node.type === 'tool_use' && typeof node.name === 'string') out.push({ name: node.name, input: node.input || {} });
    else Object.values(node).forEach(v => toolUses(v, out));
  }
  return out;
}

/**
 * 호출이 의례(upward-fetch/blast-radius) *실행*인지(순수).
 * ⚠ 임의 input을 통째로 스캔하면 안 된다 — 문서에 "blast-radius"를 *쓰는* Write/Edit이
 *   의례 수행으로 잡혀 수행률이 허수가 된다(2026-07-24 실측 중 발견한 계측 오염).
 *   실행 표면(도구 이름·셸 명령·스킬/슬래시 인자)만 본다.
 */
function isRitual(call) {
  const n = String(call.name || '');
  if (RITUAL_RE.test(n)) return true;                       // 도구 이름 자체(MCP upward_fetch 등)
  const i = call.input || {};
  if (n === 'Bash' || n === 'PowerShell') return RITUAL_RE.test(String(i.command || ''));
  if (n === 'Skill' || n === 'SlashCommand') return RITUAL_RE.test(String(i.skill || i.command || ''));
  return false;                                             // Write/Edit/Agent 등의 *내용*은 세지 않는다
}

/**
 * 세션 배열([{calls:[{name,input}...]}]) → 통계(순수).
 * ritualRate = (편집 전 의례 수행 세션) / (편집이 있는 세션).
 */
function analyze(sessions) {
  const toolCounts = {};
  let withEdits = 0, ritualBefore = 0;
  for (const s of sessions) {
    let editSeen = false, ritualSeen = false, counted = false;
    for (const c of s.calls) {
      toolCounts[c.name] = (toolCounts[c.name] || 0) + 1;
      if (!editSeen && isRitual(c)) ritualSeen = true;
      if (!editSeen && EDIT_RE.test(c.name)) {
        editSeen = true; withEdits++; counted = true;
        if (ritualSeen) ritualBefore++;
      }
    }
    void counted;
  }
  return {
    sessions: sessions.length, withEdits, ritualBefore,
    ritualRate: withEdits ? +(ritualBefore / withEdits).toFixed(2) : null,
    toolCounts,
  };
}

function readSession(file) {
  const calls = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { toolUses(JSON.parse(line), calls); } catch { /* 비JSON 줄 무시 */ }
  }
  return { file, calls };
}

function gather(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir)) {
    const full = path.join(dir, e);
    let st; try { st = fs.statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      for (const f of fs.readdirSync(full)) if (f.endsWith('.jsonl')) out.push(readSession(path.join(full, f)));
    } else if (e.endsWith('.jsonl')) out.push(readSession(full));
  }
  return out;
}

function run(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  const dir = argv.find(a => !a.startsWith('--')) || path.join(os.homedir(), '.claude', 'projects');
  const r = analyze(gather(dir));
  if (json) { console.log(JSON.stringify(r, null, 2)); return 0; }
  console.log(`# transcript-stats — ${dir}`);
  console.log(`  세션 ${r.sessions}개 / 편집 있는 세션 ${r.withEdits}개`);
  console.log(`  의례 자발 수행률(첫 편집 전 upward-fetch/blast-radius): ${r.ritualRate === null ? 'n/a' : Math.round(r.ritualRate * 100) + '%'} (${r.ritualBefore}/${r.withEdits})`);
  const top = Object.entries(r.toolCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log('  도구 호출 상위:'); top.forEach(([n, c]) => console.log(`    ${String(c).padStart(5)}  ${n}`));
  if (r.sessions === 0) console.log('  (트랜스크립트 없음 — 디렉터리 인자를 확인하라)');
  return 0;
}

module.exports = { toolUses, isRitual, analyze };

if (require.main === module) process.exit(run());
