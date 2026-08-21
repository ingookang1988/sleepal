#!/usr/bin/env node
// scripts/mcp-server.js
// zero-dependency MCP stdio 서버 (JSON-RPC 2.0, newline-delimited). union-stack plane을
// 에이전트가 *런타임에 질의*하는 표준 표면. 전부 read-only(쓰기 미노출 → 권한 우회 없음).
// 등록 예: .mcp.json → { "mcpServers": { "union-stack": { "command":"node","args":["scripts/mcp-server.js"] } } }
const { parseId } = require('./zfs_util');
const { buildIndex } = require('./zfs_index');
const { upwardFetch, blastRadius, whereToRecord } = require('./query');
const { lint } = require('./zfs-linter');
const { version: VERSION } = require('../package.json'); // 단일 출처 — 버전 드리프트 방지

const TOOLS = [
  { name: 'upward_fetch', description: '작업 진입 맥락: ID의 부모 PLAN/FLOW/CON/ARCH/MTG + 같은 계보 LSN.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'ZFS ID·파일명·브래킷 ID' } }, required: ['id'] } },
  { name: 'blast_radius', description: '수정·삭제 영향권: 대상의 모든 자손 + 잠금(Verifying) 여부.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  { name: 'where_to_record', description: '과거/결정 기록 라우팅: kind→목적지(HANDOFF/사적메모리/lessons/proposals/ledger/HISTORY).',
    inputSchema: { type: 'object', properties: { kind: { type: 'string', description: '예: pivot, lesson, adr, proposal, session' } }, required: ['kind'] } },
  { name: 'zfs_lint', description: 'ZFS 네이밍 위반 목록(쓰기 전 자가검사).',
    inputSchema: { type: 'object', properties: {} } },
  { name: 'list_docs', description: 'ZFS 문서 색인(선택: domain 필터).',
    inputSchema: { type: 'object', properties: { domain: { type: 'string' } } } },
];

/** 도구 디스패치(순수). 전부 read-only. */
function callTool(name, args = {}) {
  if (name === 'upward_fetch') { const id = parseId(args.id || ''); if (!id) throw new Error(`bad id: ${args.id}`); return upwardFetch(id, buildIndex()); }
  if (name === 'blast_radius') { const id = parseId(args.id || ''); if (!id) throw new Error(`bad id: ${args.id}`); return blastRadius(id, buildIndex()); }
  if (name === 'where_to_record') return whereToRecord(args.kind);
  if (name === 'zfs_lint') return { violations: lint() };
  if (name === 'list_docs') { const idx = buildIndex(); return { docs: args.domain ? idx.filter(d => d.domain === args.domain) : idx }; }
  throw new Error(`unknown tool: ${name}`);
}

/** JSON-RPC 요청 → 응답 객체(또는 null=알림). 순수 → 테스트 용이. */
function handle(req) {
  const { id, method, params } = req || {};
  const ok = result => ({ jsonrpc: '2.0', id, result });
  const err = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
  const isNotification = id === undefined || id === null;
  try {
    if (method === 'initialize')
      return ok({ protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'union-stack', version: VERSION } });
    if (method === 'notifications/initialized' || method === 'initialized') return null;
    if (method === 'tools/list') return ok({ tools: TOOLS });
    if (method === 'tools/call')
      return ok({ content: [{ type: 'text', text: JSON.stringify(callTool(params?.name, params?.arguments || {}), null, 2) }] });
    if (method === 'ping') return ok({});
    return isNotification ? null : err(-32601, `method not found: ${method}`);
  } catch (e) {
    return isNotification ? null : err(-32603, e.message);
  }
}

function main() {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let req;
      try { req = JSON.parse(line); } catch { continue; }
      const res = handle(req);
      if (res) process.stdout.write(JSON.stringify(res) + '\n');
    }
  });
}

module.exports = { handle, callTool, TOOLS };

if (require.main === module) main();
