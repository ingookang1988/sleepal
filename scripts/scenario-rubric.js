#!/usr/bin/env node
// scripts/scenario-rubric.js
// 시나리오 A/B의 **품질 비악화 기계 루브릭** — E6(`eval/PROTOCOL.md` §3-bis)의 성공 바 AND 절반.
// 성공 바는 "턴/토큰 유의미 감소 AND 품질 비악화"인데, 후자를 판정할 계측기가 없었다(그래서 이것).
//
// 무엇을 보는가: 런 1개(=세션 1개)의 도구 호출 **순서**에서 결함수정 절차의 관측 가능한 두 지점만 잰다
//   ① repro      — 첫 편집 *이전*에 코드를 실행했는가(재현 선행 = 추측 수정 금지의 대리 관측)
//   ② regression — 테스트 파일을 편집하고 그 *이후* 실행했는가(회귀 고정 = SKILL.md 종료조건 2번)
//   판정 verdict = repro && regression. 이 둘만이 §3-bis가 명시한 "회귀 테스트 포함 여부·최소화 수행 여부"
//   중 기계로 관측 가능한 항목이다.
//
// ⚠ 계측 오염 방지([ADR-07]): **실행 표면만** 본다 — 도구 이름·셸 명령 문자열·편집 대상 경로.
//   편집 *내용*이나 문서 본문은 절대 매칭하지 않는다(문서에 "테스트"라고 쓰면 통과하는 허수 방지).
//
// 정직한 한계: ① 종료 코드는 보지 않는다 — "실행했다"까지만 알 수 있고 "그린이었다"는 알 수 없다
//   (게이트 그린은 팔 종료 후 워크스페이스에서 `node scripts/health.js`로 따로 확인할 것).
//   ② **최소성**(SKILL 2단계)은 절대 임계값이 없어 pass/fail로 세지 않는다 — 편집 파일 수·호출 수를
//   *팔 간 비교 수치*로만 낸다. ③ 재현 명령의 형태는 과제 의존이라 실행 동사 목록 근사다.
// read-only·zero-dep. 실행: node scripts/scenario-rubric.js <transcript-dir> [--json]
const fs = require('fs');
const path = require('path');
const { walkFiles } = require('./fs_walk');
const { toolUses } = require('./transcript-stats');
const { sessionOf } = require('./session-friction');

const EDIT_RE = /^(Edit|Write|MultiEdit|NotebookEdit)$/;
const SHELL_RE = /^(Bash|PowerShell)$/;
// 코드를 *실행*하는 명령인가(첫 토큰 기준 — 파이프·체인 뒤도 허용).
const RUN_RE = /(^|[;&|]\s*)(node|npm|npx|pnpm|yarn|python3?|py|pytest|go|cargo|make|jest|vitest|mocha|dotnet)\b/;
// 테스트 파일 경로 관례(다언어).
const TEST_FILE_RE = /(\.test\.|\.spec\.|(^|[\\/])test_|_test\.)/i;

const norm = p => String(p || '').split('\\').join('/');

/**
 * 호출 순서 → 런 1개의 루브릭 판정(순수).
 * calls: [{name, input}] — 트랜스크립트 등장 순서.
 */
function judge(calls) {
  let firstEditSeen = false, repro = false, testEditAt = -1, regression = false;
  const editPaths = [];
  let editCalls = 0, runCalls = 0;

  calls.forEach((c, i) => {
    const isRun = SHELL_RE.test(c.name) && RUN_RE.test(String((c.input || {}).command || ''));
    if (isRun) {
      runCalls++;
      if (!firstEditSeen) repro = true;             // 첫 편집 전 실행 = 재현 선행
      if (testEditAt >= 0 && i > testEditAt) regression = true; // 테스트 편집 *이후* 실행 = 회귀 고정
    }
    if (!EDIT_RE.test(c.name)) return;
    const fp = norm((c.input || {}).file_path);
    if (!fp) return;
    editCalls++; editPaths.push(fp);
    firstEditSeen = true;
    if (testEditAt < 0 && TEST_FILE_RE.test(fp)) testEditAt = i;
  });

  const reasons = [];
  if (!repro) reasons.push('no-repro: 첫 편집 이전에 실행 흔적 없음(추측 수정 의심)');
  if (!regression) reasons.push('no-regression: 테스트 파일 편집 + 이후 실행이 없음(회귀 고정 누락)');
  return {
    repro, regression,
    editFiles: new Set(editPaths).size, editCalls, runCalls,
    verdict: repro && regression ? 'ok' : 'fail',
    reasons,
  };
}

/**
 * 디렉터리 → 세션(=런)별 호출 목록.
 * **런 = top-level 사용자 발화가 하나 이상 있는 세션**이다. 파일 1개를 런 1개로 세면
 * 서브에이전트 전사(`<sid>/subagents/agent-*.jsonl`)가 편집 0건짜리 가짜 런으로 분모에 끼어든다
 * (실측에서 잡힘). 서브에이전트 호출은 *부모 런의 작업*이므로 시간순으로 합류시킨다.
 */
function gatherSessions(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  walkFiles(dir, '', rel => { if (rel.endsWith('.jsonl')) files.push(rel); });
  const by = new Map();
  for (const rel of files.sort()) {
    const sid = sessionOf(rel);
    const rec = by.get(sid) || { session: sid, hasUser: false, items: [] };
    for (const line of fs.readFileSync(path.join(dir, rel), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let o; try { o = JSON.parse(line); } catch { continue; }
      const m = o.message;
      if (o.type === 'user' && m && m.role === 'user' && !o.isSidechain) rec.hasUser = true;
      const calls = toolUses(o);
      if (calls.length) rec.items.push({ ts: Date.parse(o.timestamp) || 0, i: rec.items.length, calls });
    }
    by.set(sid, rec);
  }
  return [...by.values()]
    .filter(r => r.hasUser)                       // 발화 없는 전사는 런이 아니다
    .map(r => ({
      session: r.session,
      calls: r.items.sort((a, b) => a.ts - b.ts || a.i - b.i).flatMap(x => x.calls),
    }))
    .sort((a, b) => a.session.localeCompare(b.session));
}

/** 디렉터리 → 런별 판정 + 팔 요약(순수 아님: FS 어댑터). */
function judgeDir(dir) {
  const runs = gatherSessions(dir).map(s => ({ session: s.session, ...judge(s.calls) }));
  const ok = runs.filter(r => r.verdict === 'ok').length;
  return {
    dir, runs,
    okRuns: ok, failRuns: runs.length - ok,
    okRate: runs.length ? +(ok / runs.length).toFixed(2) : null,
    meanEditFiles: runs.length ? +(runs.reduce((a, r) => a + r.editFiles, 0) / runs.length).toFixed(1) : null,
    meanEditCalls: runs.length ? +(runs.reduce((a, r) => a + r.editCalls, 0) / runs.length).toFixed(1) : null,
  };
}

function run(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  const dir = argv.find(a => !a.startsWith('--'));
  if (!dir) { console.error('사용법: node scripts/scenario-rubric.js <transcript-dir> [--json]'); return 2; }
  const r = judgeDir(dir);
  if (json) { console.log(JSON.stringify(r, null, 2)); return 0; }
  console.log(`# scenario-rubric — ${dir}`);
  if (!r.runs.length) { console.log('  런(*.jsonl) 없음 — 팔 전사 디렉터리를 확인하라.'); return 0; }
  console.log(`  런 ${r.runs.length}개 / 품질 통과 ${r.okRuns} · 실패 ${r.failRuns} (통과율 ${Math.round(r.okRate * 100)}%)`);
  console.log(`  최소성 참고치(판정 아님): 편집 파일 ${r.meanEditFiles}개 · 편집 호출 ${r.meanEditCalls}회 /런`);
  console.log('\n  런별  repro  regression  편집파일  판정');
  for (const x of r.runs) {
    console.log(`  ${x.session.slice(0, 12).padEnd(13)} ${(x.repro ? '✓' : '✗').padStart(3)} ${(x.regression ? '✓' : '✗').padStart(10)} ` +
      `${String(x.editFiles).padStart(8)}  ${x.verdict}${x.reasons.length ? '  — ' + x.reasons.join('; ') : ''}`);
  }
  console.log('\n  ⚠ 종료 코드는 보지 않는다 — 게이트 그린은 워크스페이스에서 `node scripts/health.js`로 따로 확인.');
  return 0;
}

module.exports = { judge, judgeDir, gatherSessions, RUN_RE, TEST_FILE_RE };

if (require.main === module) process.exit(run());
