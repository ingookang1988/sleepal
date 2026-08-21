#!/usr/bin/env node
// scripts/worktree.js
// 계보 파티션용 git worktree 헬퍼 — [PRO-08] 3단계, [PRO-05] "락이 아닌 파티션" 물리 격리 수단.
// 서브에이전트 1명 = 계보 서브트리 1개 = worktree 1개(브랜치 fleet/<id>).
// 실행:
//   node scripts/worktree.js add <ZFS_ID>     # ../<repo>-wt-<id> 에 브랜치 fleet/<id>로 생성
//   node scripts/worktree.js remove <ZFS_ID>  # worktree + fleet/<id> 브랜치 제거
//   node scripts/worktree.js list
const path = require('path');
const { execFileSync } = require('child_process');
const { parseId } = require('./zfs_util');

function git(args) { return execFileSync('git', args, { encoding: 'utf8' }); }

/** 대상 경로·브랜치 도출(순수). */
function plan(root, id) {
  return {
    dest: path.join(path.dirname(root), `${path.basename(root)}-wt-${id}`),
    branch: `fleet/${id}`,
  };
}

function run(argv = process.argv.slice(2)) {
  const [cmd, idArg] = argv;
  if (cmd === 'list') { process.stdout.write(git(['worktree', 'list'])); return 0; }
  const id = idArg ? parseId(idArg) : null;
  if (!['add', 'remove'].includes(cmd) || !id) {
    console.error('사용법: node scripts/worktree.js add|remove <ZFS_ID> | list');
    return 2;
  }
  const root = git(['rev-parse', '--show-toplevel']).trim();
  const { dest, branch } = plan(root, id);
  if (cmd === 'add') {
    git(['worktree', 'add', dest, '-b', branch]);
    console.log(`worktree 생성: ${dest} (브랜치 ${branch}) — 이 서브트리(${id})의 단독 작업 공간.`);
  } else {
    git(['worktree', 'remove', dest]);
    try { git(['branch', '-D', branch]); } catch { /* 이미 병합/삭제됨 */ }
    console.log(`worktree 제거: ${dest} (+브랜치 ${branch}).`);
  }
  return 0;
}

module.exports = { plan };

if (require.main === module) process.exit(run());
