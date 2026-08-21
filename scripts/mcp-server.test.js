// scripts/mcp-server.test.js
// MCP 핸들러 단위 테스트(프로세스·stdio 없이 JSON-RPC 요청객체→응답 검증).
// 실행: node scripts/mcp-server.test.js
const { handle, callTool, TOOLS } = require('./mcp-server');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

// initialize
const init = handle({ jsonrpc: '2.0', id: 1, method: 'initialize' });
check('initialize serverInfo', init.result.serverInfo.name === 'union-stack');
check('initialize capabilities.tools', !!init.result.capabilities.tools);

// tools/list
const list = handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
check('tools/list 5개', list.result.tools.length === 5);
check('tools 모두 inputSchema', list.result.tools.every(t => t.inputSchema && t.name));
check('TOOLS export 일치', TOOLS.length === 5);

// notifications/initialized → null(응답 없음)
check('notification → null', handle({ jsonrpc: '2.0', method: 'notifications/initialized' }) === null);

// tools/call where_to_record (레포 비의존)
const wr = handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'where_to_record', arguments: { kind: 'pivot' } } });
const wrText = JSON.parse(wr.result.content[0].text);
check('call where_to_record', wrText.match.destination === '.union-stack/project/HISTORY.md');

// tools/call zfs_lint (레포 의존하지만 템플릿은 위반 0)
const zl = handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'zfs_lint', arguments: {} } });
check('call zfs_lint 구조', Array.isArray(JSON.parse(zl.result.content[0].text).violations));

// tools/call list_docs domain 필터
const ld = handle({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'list_docs', arguments: { domain: 'PLAN' } } });
const docs = JSON.parse(ld.result.content[0].text).docs;
check('call list_docs domain 필터', docs.every(d => d.domain === 'PLAN'));

// 오류 경로
const bad = handle({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'nope', arguments: {} } });
check('unknown tool → error', !!bad.error);
const badId = handle({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'upward_fetch', arguments: { id: 'hello-world' } } });
check('bad id → error', !!badId.error);
const unknownMethod = handle({ jsonrpc: '2.0', id: 8, method: 'foo/bar' });
check('unknown method → error', !!unknownMethod.error);

// 직접 callTool도 동작
check('callTool list_docs', Array.isArray(callTool('list_docs', {}).docs));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
