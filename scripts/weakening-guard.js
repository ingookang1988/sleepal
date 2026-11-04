#!/usr/bin/env node
// scripts/weakening-guard.js
// 약화 표면화 + 예외 목록 증가 red([PRO-22] §3 단계 3·4). [TOOL-31]
//
// 단계 3 — 범위 diff 에서 **검사를 약하게 만드는 변경**을 나열하고 CLARIFY(비차단, "질문 한 줄"). 차단으로 승격하지 않는다(하류 3/3: 차단이면 우회만 는다).
//   신호: 테스트 파일 삭제 · skip/only 류 추가 · 단언(expect/assert/check) 순감 · 스냅샷 갱신(줄 수가 아니라 **변경 필드 종류**로 묻는다) ·
//         러너 설정 변경(jest/vitest/pytest/playwright 설정·package.json test 스크립트) · 테스트 파일의 숫자 리터럴 변경(임계 완화 후보).
//   WO evidence 에 `weakening: <사유>` 한 줄이 있으면 통과(INFO) — 사유가 있는 약화는 결정이지 사고가 아니다.
// 단계 4 — 기준선 만료의 꼴은 **ⓑ 예외 목록이 base 대비 늘면 red**(REJECT)로 택했다(ⓐ WO 자동 등재는 에이전트가 평면에 WO 를 쓰는 루프라 [ADR-12] 경계에 닿는다).
//   예외 = skip/only · eslint-disable · @ts-ignore/@ts-expect-error · noqa · nolint · allowlist/holdout/baseline 파일의 항목. 늘어난 만큼
//   `adapter.json checks[].known_failures: [{id, reason, owner, until}]` 에 **만료일과 소유자**가 있어야 산다(id 가 추가 줄에 보여야 한다). 만료(until < 오늘) 는 REJECT.
//
// 입력: git diff(기본 작업트리 vs HEAD · `--range A..B` · `--diff <file>` 로 unified diff 파일). 출력: PASS(0) · CLARIFY(3) · REJECT(1, 예외 증가·만료만).
// 실행: node scripts/weakening-guard.js [--range A..B | --diff file] [--json] [--contract]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { load: loadAdapter } = require('./adapter');
const { withContract, OUTCOME } = require('./gate-contract');

const CONTRACT = {
  gate: 'Weakening Gate (weakening-guard)',
  input: '범위 diff(작업트리 vs HEAD · --range · --diff 파일) + adapter.json checks[].known_failures + 활성 WO evidence 의 weakening: 사유',
  predicate: '약화 신호(테스트 삭제·skip 추가·단언 순감·스냅샷 필드·러너 설정·숫자 완화)는 CLARIFY 질문 한 줄. 예외 목록(skip·disable·ignore·allowlist·holdout) 증가는 known_failures(소유자·만료)로 덮이지 않으면 REJECT. 만료는 REJECT',
  scope: 'diff 의 줄 패턴만 본다 — 테스트가 옳은지, 삭제가 정당한지, 숫자 완화가 실제 완화인지는 판정하지 않는다(그래서 질문이다). 스냅샷은 줄 수를 세지 않는다. 약화 신호는 절대 차단하지 않는다',
  outcomes: ['PASS', 'CLARIFY', 'REJECT'],
  failure_mode: '예외 증가·만료 → REJECT(차단, 사유 = 어느 예외·어느 known_failure). 약화 신호 → CLARIFY 질문 목록. diff 없음 → PASS',
};

const TEST_FILE_RE = /(^|\/)(__tests__|tests?|spec)\/|\.(test|spec)\.[cm]?[jt]sx?$|_test\.(go|py)$|(^|\/)test_[^/]+\.py$|\.test\.(rb|php|rs)$/i;
const SNAP_RE = /\.snap$|__snapshots__\//;
const RUNNER_CFG_RE = /(^|\/)(jest|vitest|playwright|cypress|karma|mocha|ava)\.config\.[cm]?[jt]s$|(^|\/)(pytest\.ini|setup\.cfg|tox\.ini|\.mocharc(\.\w+)?|jest\.json)$|(^|\/)pyproject\.toml$|(^|\/)package\.json$|(^|\/)tsconfig(\.\w+)?\.json$/;
const SKIP_RE = /\b(it|test|describe|context|suite)\.(skip|only|todo)\b|\bx(it|test|describe)\s*\(|@pytest\.mark\.skip|@unittest\.skip|\bt\.Skip\(|\bpending\(|@Ignore\b|@Disabled\b/;
const ASSERT_RE = /\bexpect\s*\(|\bassert(\.\w+)?\s*[\(\s]|\bcheck\s*\(|\bt\.(Error|Fatal|Errorf|Fatalf)\(|\bshould\b/;
// noqa·nolint 는 주석 머리(# · //)가 붙은 **마커 꼴**만 — 산문 속 단어("skip · noqa 를 검사한다")는 예외가 아니다.
const EXCEPTION_RE = /eslint-disable|@ts-ignore|@ts-expect-error|#\s*noqa\b|\/\/\s*nolint\b|#\s*nolint\b|\bpragma:\s*no cover\b|\/\/\s*istanbul ignore|c8 ignore|\bHOLDOUT\b/;
const EXCEPTION_FILE_RE = /(allowlist|holdout|baseline|exceptions?|known[-_]failures?|ignore)[^/]*\.(json|txt|ya?ml|js|ts)$/i;
const NUM_RE = /-?\d+(\.\d+)?/g;

/** unified diff → [{path, status: 'A'|'D'|'M', added: [], removed: []}] (순수). */
function parseUnifiedDiff(txt) {
  const files = [];
  let cur = null;
  for (const line of String(txt || '').split(/\r?\n/)) {
    if (line.startsWith('diff --git ')) {
      const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      cur = { path: m ? m[2] : line.slice(11), status: 'M', added: [], removed: [] };
      files.push(cur);
      continue;
    }
    if (!cur) continue;
    if (line.startsWith('new file mode')) cur.status = 'A';
    else if (line.startsWith('deleted file mode')) cur.status = 'D';
    else if (line.startsWith('+++ ') || line.startsWith('--- ') || line.startsWith('@@') || line.startsWith('index ')) continue;
    else if (line.startsWith('+')) cur.added.push(line.slice(1));
    else if (line.startsWith('-')) cur.removed.push(line.slice(1));
  }
  return files;
}

// 자기언급 오염([ADR-19]): 따옴표 **안**의 마커(픽스처·문자열·이 가드 자신의 테스트)는 세지 않는다 — 마커 앞의 따옴표 수가 홀수면 문자열 안이다.
// 휴리스틱이라 주석 속 아포스트로피(`don't`)가 짝을 어긋나게 할 수 있다 — 미탐 쪽으로 틀린다(오탐보다 낫다: 이 가드는 질문이지 판정이 아니다).
const QUOTE_RE = /['"`]/g;
function matchesOutsideString(line, re) {
  const g = new RegExp(re.source, 'g');
  let m, k = 0;
  while ((m = g.exec(line)) !== null) if (((line.slice(0, m.index).match(QUOTE_RE) || []).length % 2) === 0) k++;
  return k;
}
const count = (lines, re) => lines.filter(l => matchesOutsideString(l, re) > 0).length;
// 단언은 한 줄에 여럿일 수 있다 — 줄이 아니라 **등장 횟수**를 센다(줄 단위면 `expect(a); expect(b);` → 1).
const countAll = (lines, re) => lines.reduce((n, l) => n + matchesOutsideString(l, re), 0);

/** 스냅샷 diff 에서 바뀐 필드 이름(순수) — 줄 수 대신 종류를 묻는다. */
function snapshotFields(f) {
  const keys = new Set();
  for (const l of [...f.added, ...f.removed]) {
    const m = l.match(/^\s*"?([A-Za-z_][\w.-]*)"?\s*:/);
    if (m) keys.add(m[1]);
  }
  return [...keys];
}

/** 테스트 파일에서 숫자만 다른 줄 쌍(순수) — 임계 완화 후보. */
function numericChanges(f) {
  const norm = l => l.replace(NUM_RE, '#').trim();
  const out = [];
  const removedBy = new Map();
  for (const r of f.removed) { const k = norm(r); if (k.includes('#')) (removedBy.get(k) || removedBy.set(k, []).get(k)).push(r); }
  for (const a of f.added) {
    const k = norm(a);
    const rs = removedBy.get(k);
    if (!rs || !rs.length) continue;
    const r = rs.shift();
    const from = r.match(NUM_RE) || [], to = a.match(NUM_RE) || [];
    if (from.join(',') !== to.join(',')) out.push({ from: from.join(','), to: to.join(','), line: a.trim().slice(0, 80) });
  }
  return out;
}

/**
 * 신호 추출(순수). 반환: { signals: [{kind, question, detail}], exceptions: {added, removed, net, where: []} }
 */
function analyze(files) {
  const signals = [];
  const exceptions = { added: 0, removed: 0, net: 0, where: [] };
  for (const f of files) {
    const isTest = TEST_FILE_RE.test(f.path);
    if (f.status === 'D' && isTest) signals.push({ kind: 'test-deleted', question: `테스트 파일이 삭제됐다: ${f.path} — 대체 검사가 있는가, 아니면 범위가 줄었는가?`, detail: f.path });
    const skipAdded = count(f.added, SKIP_RE), skipRemoved = count(f.removed, SKIP_RE);
    if (skipAdded > skipRemoved) signals.push({ kind: 'skip-added', question: `skip/only 류가 ${skipAdded - skipRemoved}건 늘었다(${f.path}) — 언제 되돌리는가(known_failures 의 until)?`, detail: f.path });
    if (isTest && f.status !== 'D') {
      const aA = countAll(f.added, ASSERT_RE), aR = countAll(f.removed, ASSERT_RE);
      if (aR > aA) signals.push({ kind: 'assert-decrease', question: `단언이 ${aR - aA}건 줄었다(${f.path}) — 검사 범위가 줄었는가, 중복 제거인가?`, detail: f.path });
      const nums = numericChanges(f);
      if (nums.length) signals.push({ kind: 'numeric-change', question: `테스트의 숫자 리터럴이 바뀌었다(${f.path}: ${nums.slice(0, 3).map(n => `${n.from}→${n.to}`).join(', ')}) — 임계 완화인가, 정답 갱신인가?`, detail: f.path });
    }
    if (SNAP_RE.test(f.path) && (f.added.length || f.removed.length)) {
      const fields = snapshotFields(f);
      signals.push({ kind: 'snapshot-updated', question: `스냅샷이 갱신됐다(${f.path}: 필드 ${fields.length ? fields.slice(0, 6).join('·') : '판독 불가'}) — 의도한 출력 변경인가, 리네임 1건의 파급인가?`, detail: f.path });
    }
    if (RUNNER_CFG_RE.test(f.path) && (f.added.some(l => /test|spec|include|exclude|ignore|match|timeout|passWithNoTests|bail|retries/i.test(l)) || f.removed.some(l => /test|spec|include|exclude|ignore|match|timeout|passWithNoTests|bail|retries/i.test(l)))) {
      signals.push({ kind: 'runner-config', question: `러너 설정이 바뀌었다(${f.path}) — 검사 대상(testMatch·exclude·passWithNoTests)이 줄지 않았는가?`, detail: f.path });
    }
    // 단계 4 ⓑ — 예외 목록 증감(마커 줄 + 예외 파일의 항목 줄).
    const exAdded = count(f.added, EXCEPTION_RE) + skipAdded + (EXCEPTION_FILE_RE.test(f.path) ? f.added.filter(l => l.trim() && !/^[\[\]{}]/.test(l.trim())).length : 0);
    const exRemoved = count(f.removed, EXCEPTION_RE) + skipRemoved + (EXCEPTION_FILE_RE.test(f.path) ? f.removed.filter(l => l.trim() && !/^[\[\]{}]/.test(l.trim())).length : 0);
    if (exAdded || exRemoved) { exceptions.added += exAdded; exceptions.removed += exRemoved; if (exAdded > exRemoved) exceptions.where.push(`${f.path} +${exAdded - exRemoved}`); }
  }
  exceptions.net = exceptions.added - exceptions.removed;
  return { signals, exceptions };
}

/** known_failures 평가(순수). 오늘 기준 활성/만료, 추가 줄에 id 가 보이는 것만 '덮는' 것으로 센다. */
function evaluateKnownFailures(checks, files, today = new Date()) {
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const addedText = files.flatMap(f => f.added).join('\n');
  const active = [], expired = [], malformed = [];
  for (const c of checks || []) {
    for (const k of c.known_failures || []) {
      if (!k || typeof k !== 'object' || !k.id || !k.until || !k.owner || !/^\d{4}-\d{2}-\d{2}$/.test(String(k.until))) { malformed.push(`${c.name}: ${JSON.stringify(k).slice(0, 60)}`); continue; }
      const entry = { check: c.name, id: String(k.id), reason: k.reason || '', owner: String(k.owner), until: String(k.until), covers: addedText.includes(String(k.id)) };
      (entry.until < todayStr ? expired : active).push(entry);
    }
  }
  // 덮기는 **줄** 단위다 — 활성 id 가 적힌 추가 줄 하나가 예외 하나를 덮는다(한 id 가 여러 줄을 덮을 수 있다: 같은 사유·같은 만료).
  const covering = files.flatMap(f => f.added).filter(l => active.some(e => l.includes(e.id))).length;
  return { active, expired, malformed, covering };
}

/** 판정(순수). */
function verdict(analysis, kf, reasons = []) {
  const issues = [];
  if (kf.expired.length) issues.push(...kf.expired.map(e => `known_failure 만료: ${e.check}/${e.id} (until ${e.until}, owner ${e.owner}) — 예외를 지우거나 새 until 과 사유로 갱신하라`));
  if (kf.malformed.length) issues.push(...kf.malformed.map(m => `known_failure 형식 오류(id·reason·owner·until 필수): ${m}`));
  const uncovered = analysis.exceptions.net - kf.covering;
  if (analysis.exceptions.net > 0 && uncovered > 0) {
    issues.push(`예외 목록이 base 대비 +${analysis.exceptions.net} 늘었다(${analysis.exceptions.where.join(' · ')}) — known_failures 로 덮인 것 ${kf.covering}. 소유자·만료일 없는 예외는 red 다([PRO-22] §3-4 ⓑ)`);
  }
  if (issues.length) return { outcome: 'REJECT', code: OUTCOME.REJECT, issues, questions: analysis.signals.map(s => s.question) };
  if (analysis.signals.length) {
    if (reasons.length) return { outcome: 'PASS', code: OUTCOME.PASS, issues: [], questions: [], info: `약화 ${analysis.signals.length}건 — 사유 있음: ${reasons.join(' / ')}` };
    return { outcome: 'CLARIFY', code: OUTCOME.CLARIFY, issues: [], questions: analysis.signals.map(s => s.question) };
  }
  return { outcome: 'PASS', code: OUTCOME.PASS, issues: [], questions: [] };
}

/** 활성 WO evidence 의 `weakening: <사유>`(순수-ish: 레코드 배열 입력). */
function weakeningReasons(wos) {
  const out = [];
  for (const w of wos || []) {
    const m = String(w.evidence || '').match(/weakening:\s*([^·;"]+)/);
    if (m) out.push(`WO-${w.id}: ${m[1].trim()}`);
  }
  return out;
}

function gitDiff(root, range) {
  try {
    const args = range ? ['diff', '-U0', '--no-color', range] : ['diff', '-U0', '--no-color', 'HEAD'];
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { return null; }
}

function run(argv = process.argv.slice(2), root = path.resolve(__dirname, '..')) {
  const json = argv.includes('--json');
  const di = argv.indexOf('--diff');
  const ri = argv.indexOf('--range');
  let diffTxt;
  if (di >= 0 && argv[di + 1]) { try { diffTxt = fs.readFileSync(path.resolve(argv[di + 1]), 'utf8'); } catch { console.error(`weakening-guard: diff 파일을 읽을 수 없다: ${argv[di + 1]}`); return OUTCOME.CLARIFY; } }
  else diffTxt = gitDiff(root, ri >= 0 ? argv[ri + 1] : null);
  if (diffTxt == null) { console.error('weakening-guard: git diff 를 얻지 못했다(git 없음 또는 범위 오류) — 관측 불가, 통과로 위조하지 않는다.'); return OUTCOME.CLARIFY; }
  const files = parseUnifiedDiff(diffTxt);
  const analysis = analyze(files);
  const adapter = loadAdapter(root);
  const kf = evaluateKnownFailures(adapter.checks || [], files);
  let reasons = [];
  try { const { gather } = require('./work-close'); reasons = weakeningReasons(gather(root).filter(w => !w.malformed && ['Active', 'Verifying', 'Draft'].includes(w.status))); } catch { reasons = []; }
  const v = verdict(analysis, kf, reasons);
  if (json) { console.log(JSON.stringify({ files: files.length, analysis, knownFailures: kf, reasons, ...v }, null, 2)); return v.code; }
  if (v.outcome === 'REJECT') {
    console.error(`\n[약화 가드] REJECT — 예외 증가·만료([PRO-22] §3-4 ⓑ):`);
    v.issues.forEach(i => console.error(`  ✗ ${i}`));
    if (v.questions.length) { console.error('\n약화 신호(참고):'); v.questions.forEach(q => console.error(`  ? ${q}`)); }
    return v.code;
  }
  if (v.outcome === 'CLARIFY') {
    console.error(`\n[약화 가드] CLARIFY — 질문 ${v.questions.length}건(차단하지 않는다, [PRO-22] §3-3). 사유가 있으면 WO evidence 에 \`weakening: <사유>\` 한 줄:`);
    v.questions.forEach(q => console.error(`  ? ${q}`));
    return v.code;
  }
  console.log(`약화 가드 통과: 파일 ${files.length} · 약화 신호 ${analysis.signals.length} · 예외 순증 ${analysis.exceptions.net}${v.info ? ' · ' + v.info : ''}`);
  return v.code;
}

module.exports = { parseUnifiedDiff, analyze, numericChanges, snapshotFields, evaluateKnownFailures, verdict, weakeningReasons, run, CONTRACT, TEST_FILE_RE, SKIP_RE, EXCEPTION_RE };

if (require.main === module) process.exit(withContract(CONTRACT, argv => run(argv))());
