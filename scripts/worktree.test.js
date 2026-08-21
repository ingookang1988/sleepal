// scripts/worktree.test.js
// 순수 로직(plan) 테스트 — 실제 worktree는 만들지 않는다. 실행: node scripts/worktree.test.js
const path = require('path');
const { plan } = require('./worktree');

let pass = 0, fail = 0;
function check(label, cond) { if (cond) pass++; else { fail++; console.error(`FAIL ${label}`); } }

const p = plan(path.join('D:', 'x', 'union-stack'), '01a1');
check('dest = 형제 디렉터리', p.dest === path.join('D:', 'x', 'union-stack-wt-01a1'));
check('branch = fleet/<id>', p.branch === 'fleet/01a1');

const p2 = plan(path.join('/home', 'u', 'repo'), '02b-1');
check('단말 ID 그대로', p2.dest.endsWith('repo-wt-02b-1') && p2.branch === 'fleet/02b-1');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
