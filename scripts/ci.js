#!/usr/bin/env node
// scripts/ci.js
// 게이트 체인 — **CI 제공자 비의존 정본**. [TOOL-27]
//
// 왜 스크립트인가: 게이트 순서·차단 정책이 `harness.yml` 의 YAML 안에 살면 그 지식은
// **GitHub Actions 안에만** 존재한다. 어답터가 다른 CI 를 쓰거나(대개 private 레포라
// Actions 분당 과금 대상이다) 로컬에서 같은 검사를 돌리려면 YAML 을 손으로 번역해야 하고,
// 번역본은 곧 원본과 어긋난다(로직 2벌 = 드리프트). 그래서 **본문을 여기로 옮기고**
// 워크플로는 이 스크립트를 부르는 얇은 래퍼로 남긴다 — 워크플로를 지워도 게이트는 산다.
//
// 차단 정책은 [PRO-11] 4값을 그대로 따른다:
//   0 PASS · 1 REJECT(차단) · 3 CLARIFY(경고) · 4 HOLD(경고)
// 즉 **exit 1 만 빌드를 깬다.** 3·4 는 사람이 읽을 주석으로 표면화하고 통과시킨다.
//
// [PRO-22] §3 단계 1·2(2026-10-16): 하네스 체인 뒤에 `adapter.json checks[]`(어답터의 제품 검사 선언)를 돌리고,
// 단계마다 **영수증 1줄**을 `verification/raw/receipts.md` 에 남긴다(scope=harness|product). 러너만 쓴다 — 사람·에이전트 경로 없음.
// 0건 검사 = 실패(2-bis, 3분할 — receipts.judge). 선언 부재는 무기입(INFO)이지 0 이 아니다.
//
// 실행:
//   node scripts/ci.js                    # 전체 체인 + 선언 검사
//   node scripts/ci.js --range A..B       # permission-guard 의 diff 범위 지정
//   node scripts/ci.js --skip adopter-arm # 단계 제외(쉼표 구분; `checks` 로 선언 검사 전체 제외)
//   node scripts/ci.js --only-checks      # 선언 검사만(하네스 체인 생략 — 팔·디버깅용)
//   node scripts/ci.js --no-receipts      # 영수증을 쓰지 않는다(드라이런)
//   node scripts/ci.js --scan             # package.json·훅·워크플로에서 checks[] 선언 초안을 출력(사람이 차단·비용 확정)
//   node scripts/ci.js --json
//
// 컨테이너: `docker compose run --rm harness` 가 이 스크립트를 부른다([TOOL-27]).
const { spawnSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { load: loadAdapter } = require('./adapter');
const receipts = require('./receipts');
const { parseChangelogVersion } = require('./template-update');

const ROOT = path.resolve(__dirname, '..');

// [PRO-11] 4값. 여기 없는 코드(2·5…)는 알 수 없는 실패라 차단으로 취급한다.
const OUTCOME = { 0: 'PASS', 1: 'REJECT', 3: 'CLARIFY', 4: 'HOLD' };
const BLOCKING = new Set([1]);

/** 한 단계 실행. 죽어도 던지지 않는다 — 종료 코드 자체가 판정 재료다. */
function step(name, args, { blocking = true } = {}) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
  // spawnSync 가 프로세스를 못 띄운 경우(r.error)는 코드가 null 이다 — 알 수 없는 실패.
  const code = r.error ? -1 : (r.status === null ? -1 : r.status);
  const outcome = OUTCOME[code] || 'UNKNOWN';
  // 비차단 단계는 REJECT 도 경고로 낮춘다(handoff-linter 는 REJECT 자체가 없다 — [PRO-13] §5).
  const failed = blocking && (BLOCKING.has(code) || outcome === 'UNKNOWN');
  return { name, scope: 'harness', args: args.join(' '), code, outcome, failed, durMs: Date.now() - t0, stdout: r.stdout || '', stderr: r.stderr || '' };
}

/**
 * 선언 검사 1건 실행([PRO-22] 단계 1). 셸 명령(어답터의 런너는 무엇이든). 판정은 receipts.judge(2-bis 3분할).
 * 비차단 선언의 REJECT 는 체인을 깨지 않는다(판정은 내되 빌드는 안 깬다 — 하네스 단계와 같은 문법).
 */
function runCheck(check, cwd = ROOT) {
  const t0 = Date.now();
  const r = spawnSync(check.cmd, { cwd, encoding: 'utf8', shell: true });
  const code = r.error ? -1 : (r.status === null ? -1 : r.status);
  const out = (r.stdout || '') + (r.stderr || '');
  const parsed = receipts.parseRunnerOutput(out);
  const j = receipts.judge(check, { code, targets: parsed.targets });
  return { name: check.name, scope: 'product', args: check.cmd, code, outcome: j.outcome, failed: j.code === 1, reason: j.reason, durMs: Date.now() - t0,
    targets: parsed.targets, passed: parsed.passed, failedCount: parsed.failed, skipped: parsed.skipped, runner: parsed.runner, env: check.env || null, stdout: r.stdout || '', stderr: r.stderr || '' };
}

/**
 * 체인 정의 — **순서가 계약이다.** 싼 게이트가 먼저 온다(네이밍 위반은 테스트를 돌릴 값어치도 없다).
 * blocking:false 는 "판정은 내되 빌드는 안 깬다" — [PRO-11] 의 CLARIFY/HOLD 를 CI 에서 이행하는 방식.
 */
function chain({ range = null } = {}) {
  return [
    { name: 'zfs-linter', args: ['scripts/zfs-linter.js'] },
    { name: 'history-linter', args: ['scripts/history-linter.js'] },
    // permission-guard: 범위가 없으면 자기 기본값(작업트리)을 쓴다. CI 는 --range 를 준다.
    { name: 'permission-guard', args: ['scripts/permission-guard.js', ...(range ? ['--range', range] : [])], blocking: false },
    // 약화 표면화 + 예외 증가 red([PRO-22] §3 단계 3·4, [TOOL-31]) — REJECT 는 예외 증가·만료뿐, 약화 신호는 CLARIFY.
    { name: 'weakening-guard', args: ['scripts/weakening-guard.js', ...(range ? ['--range', range] : [])] },
    { name: 'handoff-linter', args: ['scripts/handoff-linter.js'], blocking: false },
    // 생성 뷰 드리프트([PRO-21] 2단계) — CLARIFY 만 내는 비차단 게이트([TOOL-28]).
    { name: 'test-catalog', args: ['scripts/test-catalog.js'], blocking: false },
    // 배송 매니페스트 드리프트([PRO-24] ①(c), [TOOL-34]) — 태그와 목록이 어긋나면 CLARIFY.
    { name: 'ship-manifest', args: ['scripts/ship-manifest.js'], blocking: false },
    { name: 'tests', args: ['--test', ...testFiles()] },
    { name: 'health', args: ['scripts/health.js'] },
    { name: 'adopter-arm', args: ['scripts/adopter-arm.js'] },
  ];
}

/**
 * 단계의 스크립트가 **없으면** 건너뛸 수 있는가(순수). 상류 전용 도구(adopter-arm 등 — [TOOL-34] 매니페스트 밖)는 어답터에 배송되지 않으므로
 * 파일 부재가 정상이다. 그때 spawn 실패를 UNKNOWN → 차단으로 읽으면 어답터 체인이 영구 red 가 된다([PRO-24] ①(c)). 스크립트 단계만 해당(--test 는 제외).
 */
function missingScript(stepDef, root = ROOT) {
  const first = stepDef.args[0];
  if (!first || first.startsWith('--')) return false;
  return !fs.existsSync(path.join(root, first));
}

/** 스위트 목록은 glob 없이 디렉터리에서 읽는다 — 셸(및 셸 없는 컨테이너)에 의존하지 않기 위해. */
function testFiles() {
  return fs.readdirSync(path.join(ROOT, 'scripts'))
    .filter(f => f.endsWith('.test.js')).sort()
    .map(f => `scripts/${f}`);
}

/** git 상태(영수증 머리). git 이 없으면 비움(`-`) — 모르는 것을 clean 으로 단정하지 않는다. */
function gitState(cwd = ROOT) {
  const g = args => { try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };
  const sha = g(['rev-parse', '--short', 'HEAD']);
  const st = g(['status', '--porcelain', '--untracked-files=no']);
  return { sha, dirty: st == null ? null : st.length > 0 };
}

function localDate(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

/** 결과 → 영수증 줄(순수). 하네스 tests 단계는 node --test 출력에서 targets 를 읽는다. */
function receiptOf(r, git, gen, date = localDate()) {
  const parsed = r.scope === 'harness' ? receipts.parseRunnerOutput(r.stdout) : null;
  return receipts.formatReceipt({
    date, sha: git.sha, dirty: git.dirty, scope: r.scope, name: r.name, exit: r.code, outcome: r.outcome,
    targets: r.scope === 'harness' ? (r.name === 'tests' ? parsed.targets : null) : r.targets,
    passed: r.scope === 'harness' ? (r.name === 'tests' ? parsed.passed : null) : r.passed,
    failed: r.scope === 'harness' ? (r.name === 'tests' ? parsed.failed : null) : r.failedCount,
    skipped: r.scope === 'harness' ? null : r.skipped, reason: r.reason || null, env: r.env || null, durMs: r.durMs, gen, cmd: r.args,
  });
}

/** `--scan`: 선언 초안의 재료 수집(읽기 전용) → receipts.scanDeclarations. */
function scanSources(root = ROOT) {
  let scripts = {};
  try { scripts = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts || {}; } catch { /* 없음 */ }
  const hooks = [];
  for (const dir of ['.husky', '.githooks']) {
    let files = [];
    try { files = fs.readdirSync(path.join(root, dir)); } catch { continue; }
    for (const f of files) {
      if (f.startsWith('_') || f.startsWith('.')) continue;
      const lines = String(fs.readFileSync(path.join(root, dir, f), 'utf8')).split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
      lines.forEach(cmd => hooks.push({ hook: f, cmd, file: `${dir}/${f}` }));
    }
  }
  const workflows = [];
  let wf = [];
  try { wf = fs.readdirSync(path.join(root, '.github/workflows')).filter(f => /\.ya?ml$/.test(f)); } catch { /* 없음 */ }
  for (const f of wf) {
    const txt = fs.readFileSync(path.join(root, '.github/workflows', f), 'utf8');
    for (const m of txt.matchAll(/^\s*(?:-\s*)?run:\s*(.+)$/gm)) {
      const cmd = m[1].trim();
      if (cmd && cmd !== '|' && /test|lint|tsc|typecheck|e2e|smoke|bench|check|ci\.js/i.test(cmd)) workflows.push({ cmd, file: `.github/workflows/${f}` });
    }
  }
  return { scripts, hooks, workflows };
}

function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  if (argv.includes('--scan')) {
    const draft = receipts.scanDeclarations(scanSources());
    console.log(JSON.stringify({ checks: draft }, null, 2));
    if (!json) console.error(`\n선언 초안 ${draft.length}건 — adapter.json 의 "checks" 에 넣고 blocking·cost·covers 를 사람이 확정하라([PRO-22] §3-1).`);
    return 0;
  }
  const rangeIdx = argv.indexOf('--range');
  const range = rangeIdx >= 0 ? argv[rangeIdx + 1] : (process.env.CI_RANGE || null);
  const skipIdx = argv.indexOf('--skip');
  const skip = new Set((skipIdx >= 0 ? argv[skipIdx + 1] || '' : '').split(',').filter(Boolean));
  const onlyChecks = argv.includes('--only-checks');
  const writeReceipts = !argv.includes('--no-receipts');

  const results = [];
  const log = r => {
    if (json) return;
    const mark = r.failed ? '✗' : (r.outcome === 'PASS' || r.outcome === 'NOOP_PASS' ? '✓' : '!');
    const extra = r.scope === 'product' ? ` · targets ${r.targets == null ? '-' : r.targets}${r.reason ? ' · ' + r.reason : ''}` : '';
    console.log(`${mark} ${r.scope === 'product' ? 'check:' : ''}${r.name} — ${r.outcome} (exit ${r.code})${extra}`);
    if (r.failed || (r.outcome !== 'PASS' && r.outcome !== 'NOOP_PASS')) {
      const body = (r.stdout + r.stderr).trimEnd();
      if (body) console.log(body.split('\n').map(l => `    ${l}`).join('\n'));
    }
  };
  let broken = false;
  if (!onlyChecks) {
    for (const s of chain({ range })) {
      if (skip.has(s.name)) { if (!json) console.log(`- ${s.name}: 건너뜀(--skip)`); continue; }
      if (missingScript(s)) { if (!json) console.log(`- ${s.name}: 건너뜀(스크립트 없음 — 상류 전용·미배송, [TOOL-34])`); continue; }
      const r = step(s.name, s.args, { blocking: s.blocking !== false });
      results.push(r);
      log(r);
      // 차단 단계가 깨지면 즉시 멈춘다 — 뒤 단계의 출력이 원인을 덮지 않게.
      if (r.failed) { broken = true; break; }
    }
  }
  // 선언 검사([PRO-22] 단계 1) — 하네스가 깨졌으면 돌리지 않는다(원인 덮기 방지). 선언 부재는 무기입.
  const adapter = loadAdapter(ROOT);
  const checks = adapter.checks || [];
  let declared = checks.length;
  if (!broken && !skip.has('checks')) {
    for (const c of checks) {
      if (skip.has(c.name)) { if (!json) console.log(`- check:${c.name}: 건너뜀(--skip)`); continue; }
      const r = runCheck(c);
      results.push(r);
      log(r);
    }
  } else if (!json && declared) console.log(`- 선언 검사 ${declared}건: ${broken ? '하네스 차단으로 미실행' : '건너뜀(--skip checks)'}`);
  if (!json && !declared) console.log('- 선언 검사: 무기입(adapter.json checks 없음 — `node scripts/ci.js --scan` 으로 초안 생성)');

  // 영수증 — 러너만 쓴다. 실행된 단계 전부(하네스·제품), 판정과 무관하게 남긴다(끊긴 영수증이 꺼진 CI 를 보이게 한다).
  let written = 0;
  if (writeReceipts && results.length) {
    const git = gitState(ROOT);
    const gen = `ci.js@${parseChangelogVersion((() => { try { return fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'); } catch { return ''; } })()) || '?'}`;
    written = receipts.append(ROOT, results.map(r => receiptOf(r, git, gen)));
  }

  const failed = results.filter(r => r.failed);
  const warned = results.filter(r => !r.failed && r.outcome !== 'PASS' && r.outcome !== 'NOOP_PASS');
  if (json) {
    const slim = results.map(({ stdout, stderr, ...rest }) => rest);
    console.log(JSON.stringify({ results: slim, failed: failed.length, warned: warned.length, declared, receipts: written }, null, 2));
  } else {
    console.log('');
    if (failed.length) console.log(`게이트 ${failed.length}건 차단 — ${failed.map(r => (r.scope === 'product' ? 'check:' : '') + r.name).join(', ')}`);
    else console.log(`게이트 전부 통과${warned.length ? ` · 경고 ${warned.length}건(${warned.map(r => `${r.name}=${r.outcome}`).join(', ')})` : ''}`);
    if (written) console.log(`영수증 ${written}줄 → ${receipts.FILE}`);
  }
  return failed.length ? 1 : 0;
}

if (require.main === module) process.exit(main());
module.exports = { chain, step, runCheck, receiptOf, scanSources, testFiles, gitState, missingScript, OUTCOME, BLOCKING };
