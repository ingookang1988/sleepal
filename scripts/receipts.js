// scripts/receipts.js
// 실행 영수증([PRO-22] §3 단계 2 · 2-bis) — 순수 로직 + 얇은 FS 층. ci.js(쓰기) · health(나이) · work-close(인용 검사)가 공유한다.
//
// 영수증 한 줄 = "실제로 돌았는가"의 기계 기록. **사람도 에이전트도 타이핑하지 않는다** — 러너(ci.js)만 쓴다. 꼴:
//   - [2026-10-16][RCPT] sha=4bfaf4f dirty=no scope=product name=unit exit=0 outcome=PASS targets=12 passed=12 failed=0 skipped=0 reason=- env=- dur=812ms gen=ci.js@6.0.0 cmd="pnpm test"
// 필드 비움은 `-` — 비움과 0 을 구별한다([ADR-28] 문법). `cmd` 는 마지막, 따옴표.
//
// 2-bis 3분할(하류 검토 4/4): targets=0 →
//   · blocking 전수 검사            → REJECT  ("검사가 아무것도 안 보고 초록"의 차단)
//   · diff 조건부(kind 메타 · expected_zero_unless: diff) → NOOP_PASS(INFO)
//   · env 조건부(expected_zero_unless: env)             → CLARIFY + skipped/reason=env
// 집계 단위는 **선언 행**이다(파일 단위 금지). targets 를 못 읽으면 `-` 로 남기고 0건 규칙을 적용하지 않는다(모르는 것을 0 으로 단정하지 않는다).
const fs = require('fs');
const path = require('path');

const FILE = '.union-stack/verification/raw/receipts.md';
const HEADER = '<!-- [Raw] 실행 영수증 — 러너(ci.js)만 Append. 사람·에이전트 read-only. 한 줄 = 검사 1회. (예시) 줄은 꼴 안내. -->\n# Execution Receipts ([PRO-22] 영수증)\n- (예시) [2026-01-01][RCPT] sha=0000000 dirty=no scope=product name=unit exit=0 outcome=PASS targets=12 passed=12 failed=0 skipped=0 reason=- env=- dur=1ms gen=ci.js@0.0.0 cmd="pnpm test"\n';
const LINE_RE = /^- \[(\d{4}-\d{2}-\d{2})\]\[RCPT\] (.+)$/;
const KINDS = new Set(['정적', '동작', '재현', '측정', '수용', '메타']);
const COSTS = new Set(['push', 'nightly', 'manual-paid']);

/** 러너 출력에서 검사 대상 수·통과·실패를 읽는다(순수). 못 읽으면 targets=null — 0 과 구별. */
function parseRunnerOutput(out) {
  const s = String(out || '');
  let m;
  if ((m = s.match(/^# tests (\d+)/m))) {
    const g = k => { const r = s.match(new RegExp('^# ' + k + ' (\\d+)', 'm')); return r ? +r[1] : 0; };
    return { runner: 'node-test', targets: +m[1], passed: g('pass'), failed: g('fail'), skipped: g('skipped') };
  }
  if ((m = s.match(/Tests:\s+(.*?)(\d+) total/))) {
    const pick = k => { const r = m[1].match(new RegExp('(\\d+) ' + k)); return r ? +r[1] : 0; };
    return { runner: 'jest', targets: +m[2], passed: pick('passed'), failed: pick('failed'), skipped: pick('skipped') };
  }
  if ((m = s.match(/collected (\d+) items?/))) {
    const pick = k => { const r = s.match(new RegExp('(\\d+) ' + k)); return r ? +r[1] : 0; };
    return { runner: 'pytest', targets: +m[1], passed: pick('passed'), failed: pick('failed'), skipped: pick('skipped') };
  }
  if (/no tests ran/i.test(s)) return { runner: 'pytest', targets: 0, passed: 0, failed: 0, skipped: 0 };
  if ((m = s.match(/(\d+) passed/))) {
    const pick = k => { const r = s.match(new RegExp('(\\d+) ' + k)); return r ? +r[1] : 0; };
    const passed = +m[1], failed = pick('failed'), skipped = pick('skipped');
    return { runner: 'generic', targets: passed + failed + skipped, passed, failed, skipped };
  }
  return { runner: null, targets: null, passed: null, failed: null, skipped: null };
}

/**
 * 판정(순수) — 2-bis 3분할. check: 선언 행, run: {code, targets}. 반환 {outcome, code, reason}.
 * outcome ∈ PASS · NOOP_PASS · CLARIFY · REJECT. code 는 [PRO-11] 종료코드(NOOP_PASS=0).
 */
function judge(check, run) {
  const blocking = !!check.blocking;
  if (run.code !== 0) return { outcome: blocking ? 'REJECT' : 'CLARIFY', code: blocking ? 1 : 3, reason: `exit ${run.code}` };
  if (run.targets === 0) {
    const cond = check.expected_zero_unless || (check.kind === '메타' ? 'diff' : null);
    if (cond === 'diff') return { outcome: 'NOOP_PASS', code: 0, reason: 'diff 조건부 — 대상 없음은 정상' };
    if (cond === 'env') return { outcome: 'CLARIFY', code: 3, reason: 'env' };
    return blocking
      ? { outcome: 'REJECT', code: 1, reason: '0건 검사 = 실패([PRO-22] 2-bis) — 검사가 아무것도 안 봤다' }
      : { outcome: 'CLARIFY', code: 3, reason: '0건 검사(비차단)' };
  }
  return { outcome: 'PASS', code: 0, reason: run.targets == null ? 'targets 미판독(0건 규칙 미적용)' : null };
}

/** 영수증 한 줄(순수). 비움은 `-`. */
function formatReceipt({ date, sha, dirty, scope, name, exit, outcome, targets, passed, failed, skipped, reason, env, durMs, gen, cmd }) {
  const v = x => (x === null || x === undefined || x === '' ? '-' : String(x).replace(/\s+/g, '_'));
  return `- [${date}][RCPT] sha=${v(sha)} dirty=${dirty == null ? '-' : dirty ? 'yes' : 'no'} scope=${v(scope)} name=${v(name)} exit=${v(exit)} outcome=${v(outcome)} `
    + `targets=${v(targets)} passed=${v(passed)} failed=${v(failed)} skipped=${v(skipped)} reason=${v(reason)} env=${v(Array.isArray(env) ? env.join(',') : env)} `
    + `dur=${durMs == null ? '-' : Math.round(durMs) + 'ms'} gen=${v(gen)} cmd="${String(cmd || '').replace(/"/g, "'")}"`;
}

/** 영수증 텍스트 → 레코드 배열(순수). (예시) 줄은 제외. */
function parseReceipts(txt) {
  const out = [];
  for (const line of String(txt || '').split(/\r?\n/)) {
    const m = line.match(LINE_RE);
    if (!m) continue;
    const rec = { date: m[1] };
    const re = /(\w+)=("[^"]*"|\S+)/g;
    let t;
    while ((t = re.exec(m[2])) !== null) rec[t[1]] = t[2].startsWith('"') ? t[2].slice(1, -1) : t[2];
    for (const k of ['targets', 'passed', 'failed', 'skipped', 'exit']) if (rec[k] != null && rec[k] !== '-' && /^-?\d+$/.test(rec[k])) rec[k] = +rec[k];
    out.push(rec);
  }
  return out;
}

/** 검사명별 최신 영수증(순수). scope 를 주면 그 범위만. */
function latestByName(receipts, scope = null) {
  const m = new Map();
  for (const r of receipts) {
    if (scope && r.scope !== scope) continue;
    const cur = m.get(r.name);
    if (!cur || r.date >= cur.date) m.set(r.name, r);
  }
  return m;
}

/** 날짜 나이(일, 순수). */
function ageDays(date, today = new Date()) {
  const d = new Date(date + 'T00:00:00');
  if (isNaN(d)) return null;
  return Math.max(0, Math.floor((today - d) / 86400000));
}

/**
 * 선언 초안 생성(순수) — package.json scripts · 훅 · 워크플로 run 줄에서. 사람은 차단 여부·비용만 확정한다(손표는 썩는다 — 3/3).
 * kind 추정: test→동작 · lint/tsc/typecheck→정적 · e2e/smoke→재현 · bench/perf→측정 · 그 외 메타.
 */
function scanDeclarations({ scripts = {}, hooks = [], workflows = [] } = {}) {
  const guessKind = n => /e2e|smoke|integration/i.test(n) ? '재현' : /bench|perf/i.test(n) ? '측정' : /lint|tsc|typecheck|type-check|format/i.test(n) ? '정적' : /test|spec|unit/i.test(n) ? '동작' : '메타';
  const checks = [];
  for (const [name, cmd] of Object.entries(scripts)) {
    if (!/test|spec|lint|tsc|typecheck|type-check|e2e|smoke|bench|check|verify/i.test(name)) continue;
    checks.push({ name, cmd: `npm run ${name}`, blocking: /^(test|lint|typecheck|tsc)$/i.test(name), runs_on: ['pre-push'], kind: guessKind(name), cost: 'push', covers: '(확인 필요)', source: 'package.json' });
  }
  hooks.forEach((h, i) => checks.push({ name: `hook-${h.hook || i}`, cmd: h.cmd, blocking: true, runs_on: [h.hook || 'hook'], kind: guessKind(h.cmd), cost: 'push', covers: '(확인 필요)', source: h.file || 'hook' }));
  workflows.forEach((w, i) => checks.push({ name: `ci-${i + 1}`, cmd: w.cmd, blocking: false, runs_on: ['ci'], kind: guessKind(w.cmd), cost: 'push', covers: '(확인 필요)', source: w.file || 'workflow' }));
  return checks;
}

function read(root = path.resolve(__dirname, '..')) {
  try { return fs.readFileSync(path.join(root, FILE), 'utf8'); } catch { return null; }
}

/** 러너 전용 append — 파일이 없으면 헤더와 함께 만든다. EOL 은 파일 지배값. */
function append(root, lines) {
  const abs = path.join(root, FILE);
  let cur = read(root);
  if (cur == null) { fs.mkdirSync(path.dirname(abs), { recursive: true }); cur = HEADER; }
  const eol = (cur.match(/\r\n/g) || []).length > (cur.match(/(?<!\r)\n/g) || []).length ? '\r\n' : '\n';
  const body = (cur.endsWith('\n') ? cur : cur + eol) + lines.join(eol) + eol;
  fs.writeFileSync(abs, body);
  return lines.length;
}

/** evidence 문자열의 영수증 인용(순수): `rcpt:<name>@<sha>` 목록 + `rcpt:n/a` 여부. */
function citations(evidence) {
  const s = String(evidence || '');
  const refs = [...s.matchAll(/rcpt:([A-Za-z0-9_.-]+)@([0-9a-f]{7,40})/g)].map(m => ({ name: m[1], sha: m[2] }));
  return { refs, na: /rcpt:n\/a/.test(s) };
}

module.exports = { FILE, HEADER, KINDS, COSTS, parseRunnerOutput, judge, formatReceipt, parseReceipts, latestByName, ageDays, scanDeclarations, read, append, citations };
