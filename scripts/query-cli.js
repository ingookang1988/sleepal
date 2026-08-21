#!/usr/bin/env node
// scripts/query-cli.js
// 5개 read-only 도구를 통일된 JSON으로 출력하는 얇은 CLI(슬래시 커맨드·사람 공용).
// mcp-server의 callTool을 재사용 → 로직 중복 0.
// 예: node scripts/query-cli.js where_to_record pivot
const { callTool } = require('./mcp-server');

const [name, ...rest] = process.argv.slice(2);
const ARG_KEY = { upward_fetch: 'id', blast_radius: 'id', where_to_record: 'kind', list_docs: 'domain' };
if (!name) {
  console.error('사용법: node scripts/query-cli.js <upward_fetch|blast_radius|where_to_record|zfs_lint|list_docs> [arg]');
  process.exit(2);
}
const args = ARG_KEY[name] && rest[0] ? { [ARG_KEY[name]]: rest[0] } : {};
try {
  console.log(JSON.stringify(callTool(name, args), null, 2));
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
