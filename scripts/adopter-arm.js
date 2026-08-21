#!/usr/bin/env node
// scripts/adopter-arm.js
// 어답터 팔([PRO-17]) — **상류가 자기 형상만 도는 것**을 구조로 닫는다([LSN-17]).
//
// 새 게이트가 아니라 **기존 게이트를 다른 형상에서 한 번 더 돌리는 것**이다(로직 1벌 원칙).
// 사본을 만들고 형상을 바꾼 뒤, 이미 있는 도구(`health`·`dashboard`·스위트)를 그대로 실행한다.
//
// 두 축(축마다 실측 결함이 근거다 — 가공한 시나리오가 아니다):
//
//   env  : `init --apply --drop-template-bits` 를 실제로 적용한 사본.
//          픽스처 부재·모듈 부재·스크립트 미실행 뷰어를 견디는가.
//          근거 [ADR-26](무JS 도달 불가) · [ADR-27]·[ADR-30](상류 픽스처 단언) · [ADR-28](하드 require).
//
//   data : 평면 **내용의 모양**만 바꾼 사본(문서 개수·표 개수·마크다운 관례).
//          `init` 을 돌리지 않는다 — 축을 섞지 않기 위해서다.
//          근거 [ADR-31](HISTORY 헤딩형 → 분기점 0) · [ADR-35]·[ADR-37](마커 원문 노출 · 헤더 오계수).
//
// **왜 data 축이 따로 필요한가**: env 팔의 사본은 `init` 만 돌린 것이라 여전히 *상류의 데이터*를
// 쓴다. [PRO-17] §5 는 형상 매트릭스를 "형상 하나를 통과했는데 실어답터가 깨진 사례가 나오면"
// 으로 보류했고, [ADR-31]·[ADR-37]이 정확히 그 사례다 — 재개 조건이 충족되어 축을 하나 늘렸다.
//
// 종료 코드: 0 = 성공 바 전부 충족 · 1 = 하나라도 미충족(차단).
//
// 실행:
//   node scripts/adopter-arm.js                 # 두 축 전부
//   node scripts/adopter-arm.js --shape env     # 한 축만
//   node scripts/adopter-arm.js --keep <dir>    # 워크스페이스 보존(디버깅)
//   node scripts/adopter-arm.js --json
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { copyTree } = require('./fs_walk');
const { read: readLedger } = require('./ledger');

const ROOT = path.resolve(__dirname, '..');

/** 사본에서 node 를 돌린다. 죽어도 던지지 않는다 — 크래시 여부 자체가 판정 재료다. */
function run(cwd, args) {
  try {
    const stdout = execFileSync(process.execPath, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, stdout, stderr: '', signal: null };
  } catch (e) {
    // ⚠ `String(e)` 를 stderr 로 흘리지 않는다 — execFileSync 의 래퍼 문구가 "Error: Command
    // failed:" 라서, 그걸 자식의 stderr 로 섞으면 **모든 비영 종료가 크래시로 오판**된다(실측).
    return {
      code: typeof e.status === 'number' ? e.status : -1,
      stdout: e.stdout ? String(e.stdout) : '',
      stderr: e.stderr ? String(e.stderr) : '',
      signal: e.signal || null,
    };
  }
}

// 크래시의 흔적 = 스택 프레임 또는 던져진 Error 이름. 게이트가 stderr 로 내는 판정문(`✗ …`)과
// 구별하기 위해 **줄 머리**에 앵커한다.
const CRASH_RE = /(?:^|\n)\s*\w*Error\b|(?:^|\n)\s+at [^\n]*:\d+:\d+/;

/**
 * 크래시(예외로 죽음)와 게이트 FAIL(판정으로 1)을 가른다 — 팔이 보는 것은 전자다.
 * 이 구별이 [ADR-28]의 판정 문법이다: 게이트는 `해당 없음`도 `FAIL`도 낼 수 있으나 **죽어서는
 * 안 된다**. 죽음만 팔의 실패로 센다.
 */
function crashed(r) {
  return !!r.signal || r.code === -1 || CRASH_RE.test(r.stderr);
}

// --- data 축 픽스처 ---------------------------------------------------------
// 각 형상은 실측 결함에서 왔다. 가공을 늘리지 않는다 — 늘리면 팔이 자기 상상을 검사하게 된다.
const ZONES = 13;          // [ADR-37]: 존별 표 여러 개 · 한국어 헤더
const ROWS_PER_ZONE = 4;
const HISTORY_ENTRIES = 3; // [ADR-31]: 헤딩형 분기점

/** 대안 형상의 평면 데이터를 만든다(순수). 반환: {rel: 내용} + 정답(ground truth). */
function dataShape() {
  const files = {};
  // ① live.md — 존별 표 N개, 한국어 헤더, 백틱 경로, 볼드 상태([ADR-37] B)
  const live = ['<!-- [Wiki] 라이브 제품 표면. -->', '# Live Features', ''];
  let liveRows = 0;
  for (let z = 1; z <= ZONES; z++) {
    live.push(`## 존 ${z}`, '| 기능 | ZFS Ref | 상태 |', '|---|---|---|');
    for (let r = 1; r <= ROWS_PER_ZONE; r++) {
      liveRows++;
      live.push(`| 기능${liveRows} \`/zone${z}/item${r}\` | [PLAN-01a] | **Live** |`);
    }
    live.push('');
  }
  files['.union-stack/feature/live.md'] = live.join('\n') + '\n';

  // ② 원장 — 볼드가 구분자를 감싸는 관례([ADR-37] A)
  const ledger = ['<!-- [Raw] 결정화된 ADR 영구 원장. Append-only. -->', '# Architecture Decision Ledger'];
  for (let i = 2; i <= 9; i++) {
    ledger.push(`- [2026-0${i}-01][ADR-0${i}]: **결정 제목 ${i} — 부제가 구분자 뒤에 온다(\`scripts/x.js\`).** 본문은 이어진다.`);
  }
  files['.union-stack/archive_ledger.md'] = ledger.join('\n') + '\n';

  // ③ HISTORY — 헤딩형([ADR-31]). 근거 라벨을 달아 CLARIFY 가 아니라 정상 계수가 되게 한다.
  const hist = ['<!-- [Schema/Raw] 프로젝트 전략적 분기점. -->', '# Project History', ''];
  for (let i = 1; i <= HISTORY_ENTRIES; i++) {
    hist.push(`### 2026-0${i}-15 — 전략 분기점 ${i}`, '',
      `- **Context:** 상황 ${i}`, `- **Rationale:** 근거 ${i} — \`이유\`가 있다`, `- **Impact:** 시사점 ${i}`, '');
  }
  files['.union-stack/project/HISTORY.md'] = hist.join('\n') + '\n';

  // ④ HANDOFF §3 — 인용 + 헤딩 + 볼드 + 코드가 섞인 산문([ADR-35])
  files['.union-stack/sprint/HANDOFF.md'] = [
    '<!-- [Wiki] 세션 이어달리기. -->', '---', 'session_id: shape-probe', 'date: 2026-08-20T00:00:00Z',
    'author: agent', 'verification: "형상 팔 픽스처"', 'version: 1.0', '---', '',
    '# Handoff → 다음 세션', '',
    '## 1. 세션 요약', '- 형상 팔이 쓰는 픽스처다.', '',
    '## 2. 변경 위치 (ID 목록)', '- `scripts/x.js`', '',
    '## 3. 다음 작업 (단일 진입점)',
    '> ### 🎯 **다음 작업 제목** (부가) — 이월 없음',
    'webapp `serialize-x` 경로로 … **볼드**와 `코드`가 섞인다.', '',
    '## 4. 미해결 / 주의',
    // 접힌 줄에 걸친 볼드 — 줄 단위로 변환하면 짝이 갈려 원문이 노출된다(팔이 잡은 형상).
    '- 규율: **여러 줄에 걸친 강조는 `편집기 폭` 때문에',
    '  흔하다**(픽스처가 곧 회귀 고정).', '',
    '## 5. 검증 상태', '- 해당 없음', '',
  ].join('\n') + '\n';

  return { files, truth: { liveRows, historyEntries: HISTORY_ENTRIES } };
}

// --- 성공 바 ----------------------------------------------------------------
/** 렌더 본문(속성 제외)에 원문 마크다운 마커가 남았는가(순수). [ADR-35]·[ADR-37] 계약. */
function rawMarkers(html) {
  const body = String(html).slice(String(html).indexOf('<main>'))
    .replace(/title="[^"]*"/g, '').replace(/<[^>]*>/g, '');
  return (body.match(/\*\*|`/g) || []).length;
}

/** 무JS 도달성 — 형상 검사([ADR-26] 계약. 헤드리스 브라우저 의존 없이 판정). */
function noJsReachable(html) {
  const views = [...html.matchAll(/class="view" data-view="([a-z]+)"/g)].map(m => m[1]);
  if (!views.length) return { ok: false, why: '뷰가 없다' };
  const radios = (html.match(/class="vsel" type="radio"/g) || []).length;
  const rules = views.every(v => html.includes(`#v-${v}:checked ~ main .view[data-view="${v}"] { display:block; }`));
  const anchors = /<a [^>]*data-nav=/.test(html);
  const ok = radios === views.length && rules && !anchors;
  return { ok, why: ok ? '' : `라디오 ${radios}/${views.length} · 규칙 ${rules} · 앵커 ${anchors}` };
}

function envArm(ws) {
  const bars = [];
  const before = (readLedger(ws).match(/^- \[\d{4}-\d{2}-\d{2}\]\[ADR-\d+\]:/gm) || []).length;
  const init = run(ws, ['scripts/init.js', '--name', 'Adopter Probe', '--slug', 'probe', '--apply', '--drop-template-bits']);
  bars.push({ name: 'init 적용', ok: init.code === 0, detail: init.code === 0 ? '' : init.stderr.slice(0, 200) });

  // 상류 결정 기록이 한 건도 넘어가지 않는가([ADR-36]① — 머리는 리셋되는데 **회전본이 남아**
  // 신선한 어답터가 상류 ADR 24건을 물려받았다). 머리만 보면 못 잡는다: 저장소 전체를 센다.
  const after = (readLedger(ws).match(/^- \[\d{4}-\d{2}-\d{2}\]\[ADR-\d+\]:/gm) || []).length;
  bars.push({ name: '상류 ADR 잔존 0', ok: after === 0, detail: `${before} → ${after}건(회전본 포함 전수)` });

  const suite = run(ws, ['--test', 'scripts/*.test.js']);
  const failLine = (suite.stdout.match(/^# fail (\d+)$/m) || [])[1];
  bars.push({ name: '스위트 실패 0', ok: failLine === '0', detail: `fail ${failLine ?? '?'} (픽스처 부재는 건너뜀이지 실패가 아니다)` });

  const health = run(ws, ['scripts/health.js']);
  bars.push({ name: 'health 크래시 0 · exit 0', ok: health.code === 0 && !crashed(health), detail: `exit ${health.code}` });

  const dash = run(ws, ['scripts/dashboard.js', '--out', 'probe.html']);
  let reach = { ok: false, why: '산출물 없음' };
  if (!crashed(dash)) {
    try { reach = noJsReachable(fs.readFileSync(path.join(ws, 'probe.html'), 'utf8')); } catch (e) { reach = { ok: false, why: e.message }; }
  }
  bars.push({ name: '무JS 도달성', ok: reach.ok, detail: reach.why });
  return bars;
}

function dataArm(ws) {
  const { files, truth } = dataShape();
  for (const [rel, txt] of Object.entries(files)) {
    const abs = path.join(ws, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, txt);
  }
  const bars = [];
  // 도구 3종이 **죽지 않는가**. exit 0 은 요구하지 않는다 — 주입 콘텐츠에 더미 마커가 없어
  // 누설 게이트가 FAIL 하는 것이 정상이고, 그건 크래시가 아니라 판정이다.
  for (const [name, args] of [['health', ['scripts/health.js']],
    ['dashboard', ['scripts/dashboard.js', '--out', 'probe.html']],
    ['lineage-tree', ['scripts/lineage-tree.js', '--out', 'probe-tree.html']]]) {
    const r = run(ws, args);
    bars.push({ name: `${name} 크래시 0(exit 무관)`, ok: !crashed(r),
      detail: crashed(r) ? r.stderr.split('\n').find(Boolean) || '스택' : `exit ${r.code}` });
  }

  let html = '';
  try { html = fs.readFileSync(path.join(ws, 'probe.html'), 'utf8'); } catch { /* 아래 바가 잡는다 */ }
  const markers = html ? rawMarkers(html) : -1;
  bars.push({ name: '렌더 본문 원문 마커 0', ok: markers === 0, detail: `${markers}건` });

  // 계수 정확성 — 픽스처가 정답을 안다. "표시가 아니라 숫자가 틀린" 부류를 잡는 자리다([ADR-37]).
  const probe = run(ws, ['-e', [
    "const d=require('./scripts/dashboard');const p=d.gatherAll('.').product;",
    "const h=require('./scripts/history-linter');const fs=require('fs');",
    "const hist=h.parseEntries(fs.readFileSync('.union-stack/project/HISTORY.md','utf8')).filter(e=>!e.example);",
    "console.log(JSON.stringify({live:p.live.length,history:hist.length}));",
  ].join('')]);
  let counts = null;
  try { counts = JSON.parse(probe.stdout.trim().split('\n').pop()); } catch { /* null */ }
  bars.push({ name: `live 계수 정확(정답 ${truth.liveRows})`, ok: !!counts && counts.live === truth.liveRows,
    detail: counts ? `${counts.live}건 — 헤더가 데이터로 새면 여기서 부푼다` : '측정 실패' });
  bars.push({ name: `HISTORY 분기점 계수 정확(정답 ${truth.historyEntries})`, ok: !!counts && counts.history === truth.historyEntries,
    detail: counts ? `${counts.history}건 — 형식이 다르면 조용한 0 이 된다` : '측정 실패' });
  return bars;
}

function main(argv = process.argv.slice(2)) {
  const si = argv.indexOf('--shape');
  const shape = si >= 0 && argv[si + 1] ? argv[si + 1] : 'all';
  const ki = argv.indexOf('--keep');
  const keep = ki >= 0 && argv[ki + 1] ? path.resolve(argv[ki + 1]) : null;
  const json = argv.includes('--json');

  const shapes = shape === 'all' ? ['env', 'data'] : [shape];
  const results = [];
  for (const s of shapes) {
    const ws = keep ? path.join(keep, s) : fs.mkdtempSync(path.join(os.tmpdir(), `arm-${s}-`));
    fs.mkdirSync(ws, { recursive: true });
    const files = copyTree(ROOT, ws);
    const bars = s === 'env' ? envArm(ws) : s === 'data' ? dataArm(ws) : [{ name: `알 수 없는 형상 '${s}'`, ok: false, detail: 'env|data|all' }];
    results.push({ shape: s, workspace: keep ? ws : null, files, bars });
    if (!keep) fs.rmSync(ws, { recursive: true, force: true });
  }

  if (json) { console.log(JSON.stringify(results, null, 2)); return results.some(r => r.bars.some(b => !b.ok)) ? 1 : 0; }
  console.log(`# 어답터 팔([PRO-17]) — 형상 ${shapes.join('·')}\n`);
  let failed = 0;
  for (const r of results) {
    console.log(`## ${r.shape} 형상 (사본 ${r.files} 파일)${r.workspace ? ` → ${r.workspace}` : ''}`);
    for (const b of r.bars) {
      if (!b.ok) failed++;
      console.log(`  ${b.ok ? '✓' : '✗'} ${b.name}${b.detail ? `  — ${b.detail}` : ''}`);
    }
    console.log('');
  }
  console.log(failed
    ? `성공 바 ${failed}건 미충족 — 상류 형상에서만 참인 사실이 남아 있다([LSN-17]).`
    : '성공 바 전부 충족 — 두 형상에서 같은 게이트가 성립한다.');
  return failed ? 1 : 0;
}

module.exports = { dataShape, rawMarkers, noJsReachable, crashed, ZONES, ROWS_PER_ZONE, HISTORY_ENTRIES };

if (require.main === module) process.exit(main());
