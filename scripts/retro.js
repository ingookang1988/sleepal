#!/usr/bin/env node
// scripts/retro.js
// 회고 트리거([PRO-25] ①②④ — v0.2 지표) — 파일(과 git 날짜)에서만 계산한다. 전사 없는 도구에서도 돈다. [TOOL-32]
//
// 회고는 **정리 기계**다: 트리거는 관측(health `retro due`), 실행은 사람이 연 "PO 판정 묶음 세션"이다. 에이전트는 CLARIFY 가 뜨면
// HANDOFF §4 에 "회고 제안 — <사유>" 한 줄을 쓰고 그 이상 하지 않는다. 자동 증류·승격이 아니므로 [ADR-12] 재개가 아니다.
//
// 지표 7(어답터가 `adapter.json retro:` 로 임계를 덮거나 `off` 로 끈다 — [ADR-29]):
//   issuance     발행 증분 = 전체 WO − 직전 회고 기록 스냅샷(wo_total)             ≥30  (기록 없으면 "기준 없음")
//   archiveDebt  sprint/ 루트에 남은 Closed WO(statusMap 적용)                        ≥10
//   stale        비종결이고 마지막 커밋 ≥staleDays(30) 인 WO 수                       ≥5   (Verifying 수는 무의미 — 정체 일수로)
//   gcPlans      자식(WO/PLAN) 전부 terminal 인데 자신은 terminal 아닌 PLAN               ≥1
//   planeLag     평면별(live·gap·evidence) 최신 날짜 − 최신 WO 커밋 날짜, 가장 낡은 평면 기준 ≥30일 (state 는 생성 뷰 — 별도 INFO)
//   distill      마지막 LSN 갱신 커밋 이후 종결된 WO 수                                  ≥30
//   ledgerKb     원장 머리 크기                                                           ≥30KB(회전 필요, [PRO-18])
//
// 회차 기록: plan/analytics/ANL-00<x>_retro_<yyyymmdd>.md (메타 계보 00 · append-only · parent: PRO-25 — 어답터는 up:PRO-25).
// 실행: node scripts/retro.js [--root <dir>] [--json] [--record [--write]] [--proposal]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { buildIndex, readFront } = require('./zfs_index');
const { gather: gatherWos } = require('./work-close');
const { load: loadAdapter } = require('./adapter');
const { isDescendant } = require('./zfs_util');
const ledger = require('./ledger');
const { withContract, OUTCOME } = require('./gate-contract');

const CONTRACT = {
  gate: 'Retro Due Gate (retro)',
  input: '.union-stack 평면(WO·PLAN·LSN frontmatter, 평면 날짜, 원장 크기) + git 파일 날짜(없으면 mtime) + 직전 회고 기록(ANL-00<x>) 스냅샷 + adapter.json retro: 임계',
  predicate: '지표 7 중 하나라도 임계를 넘으면 CLARIFY(회고 제안) — 넘지 않으면 PASS 로 현재 값만',
  scope: '파일·날짜·개수만 본다 — 회고를 열지 않고, 판정하지 않고, WO 를 쓰지 않는다. 임계는 측정 전 추정치라 어답터 실측으로 조정한다. 전사(세션 기록)는 읽지 않는다',
  outcomes: ['PASS', 'CLARIFY'],
  failure_mode: '초과 지표의 사유 목록 + CLARIFY(3, 비차단). git 없음은 mtime 폴백 + 표기',
};

const DEFAULTS = { issuance: 30, archiveDebt: 10, staleDays: 30, staleCount: 5, gcPlans: 1, planeLagDays: 30, distill: 30, ledgerKb: 30 };
const TERMINAL = new Set(['Closed', 'Crystallized']);
const PLANES = [
  { name: 'live', rel: '.union-stack/feature/live.md' },
  { name: 'gap', rel: '.union-stack/verification/derived/gap.md' },
  { name: 'evidence', rel: '.union-stack/verification/raw/evidence.md' },
];
const GENERATED = [{ name: 'state', rel: '.union-stack/verification/derived/state.md' }];
const RETRO_RE = /^ANL-00([a-km-np-z]+)_retro_(\d{8})\.md$/;
const LETTERS = 'abcdefghijkmnpqrstuvwxyz';

function localDate(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function daysBetween(a, b) { const x = new Date(a + 'T00:00:00'), y = new Date(b + 'T00:00:00'); return isNaN(x) || isNaN(y) ? null : Math.floor((y - x) / 86400000); }
function lastDateIn(txt) { const ds = String(txt || '').match(/\b20\d{2}-\d{2}-\d{2}\b/g); return ds && ds.length ? ds.sort().pop() : null; }

/** 임계 합성(순수): 기본값 + adapter retro 덮어쓰기. off 목록은 지표를 끈다. */
function thresholds(cfg) {
  const r = (cfg && cfg.retro) || {};
  const t = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (Number.isFinite(r[k])) t[k] = r[k];
  return { t, off: new Set(Array.isArray(r.off) ? r.off : []) };
}

/**
 * 지표 계산(순수). input: { woTotal, prev:{date, snap}|null, archiveDebt, stale:[{id,days}], gcPlans:[ids], planes:[{name,last}], latestWoDate,
 *   distillClosed, lsnLast, ledgerKb, dateSource }
 * 반환: { indicators:[{key,name,value,threshold,over,note}], due, reasons, delta:[{key,prev,now}] }
 */
function computeIndicators(input, cfg = null) {
  const { t, off } = thresholds(cfg);
  const ind = [];
  const prevSnap = input.prev && input.prev.snap ? input.prev.snap : null;
  const issuance = prevSnap && Number.isFinite(prevSnap.woTotal) ? input.woTotal - prevSnap.woTotal : null;
  ind.push({ key: 'issuance', name: '발행 증분', value: issuance, threshold: t.issuance, over: issuance != null && issuance >= t.issuance,
    note: issuance == null ? `기준 없음(회고 기록 없음 · 전체 WO ${input.woTotal})` : `직전 회고 ${input.prev.date} 이후` });
  ind.push({ key: 'archiveDebt', name: '보관 부채', value: input.archiveDebt, threshold: t.archiveDebt, over: !off.has('archiveDebt') && input.archiveDebt >= t.archiveDebt, note: off.has('archiveDebt') ? '끔' : 'sprint/ 루트의 Closed WO' });
  const stale = (input.stale || []).filter(s => s.days >= t.staleDays);
  ind.push({ key: 'stale', name: '정체 WO', value: stale.length, threshold: t.staleCount, over: stale.length >= t.staleCount,
    note: stale.length ? `마지막 커밋 ≥${t.staleDays}일: ${stale.slice(0, 5).map(s => `WO-${s.id}(${s.days}d)`).join(' ')}${stale.length > 5 ? ' …' : ''}` : `비종결 WO 중 ${t.staleDays}일 이상 정체 없음` });
  ind.push({ key: 'gcPlans', name: 'GC 가능 PLAN', value: (input.gcPlans || []).length, threshold: t.gcPlans, over: (input.gcPlans || []).length >= t.gcPlans,
    note: (input.gcPlans || []).length ? (input.gcPlans || []).map(p => `PLAN-${p}`).join(' ') : '자식 전부 terminal 인 비terminal PLAN 없음' });
  const lags = (input.planes || []).map(p => ({ name: p.name, last: p.last, lag: p.last && input.latestWoDate ? daysBetween(p.last, input.latestWoDate) : null }));
  const worst = lags.filter(l => l.lag != null).sort((a, b) => b.lag - a.lag)[0] || null;
  ind.push({ key: 'planeLag', name: '평면 지연', value: worst ? worst.lag : null, threshold: t.planeLagDays, over: !!worst && worst.lag >= t.planeLagDays,
    note: lags.length ? lags.map(l => `${l.name} ${l.last || '무기입'}${l.lag != null ? `(${l.lag}d)` : ''}`).join(' · ') + (input.generated ? ` · 생성 뷰 ${input.generated.map(g => `${g.name} ${g.last || '안 돌림'}`).join(' ')}` : '') : '평면 없음' });
  ind.push({ key: 'distill', name: '증류 정체', value: input.distillClosed, threshold: t.distill, over: input.distillClosed >= t.distill,
    note: input.lsnLast ? `마지막 LSN 갱신 ${input.lsnLast} 이후 종결` : 'LSN 갱신 기록 없음 — 종결 전수' });
  ind.push({ key: 'ledgerKb', name: '원장 크기', value: input.ledgerKb, threshold: t.ledgerKb, over: !off.has('ledger') && input.ledgerKb >= t.ledgerKb, note: off.has('ledger') ? '끔' : 'KB(≥ 임계면 회전 [PRO-18])' });
  const reasons = ind.filter(i => i.over).map(i => `${i.name} ${i.value}≥${i.threshold}`);
  const delta = prevSnap ? ind.filter(i => Number.isFinite(prevSnap[i.key]) && i.value != null).map(i => ({ key: i.key, name: i.name, prev: prevSnap[i.key], now: i.value })) : [];
  return { indicators: ind, due: reasons.length > 0, reasons, delta, dateSource: input.dateSource || 'git' };
}

/** 한 git 호출로 디렉터리 파일들의 마지막 커밋 날짜(최신 우선). git 없으면 null. */
function gitDates(root, relDir) {
  try {
    const out = execFileSync('git', ['log', '--format=%x00%cs', '--name-only', '--', relDir], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    const map = new Map();
    let cur = null;
    for (const line of out.split(/\r?\n/)) {
      if (line.startsWith('\u0000')) { cur = line.slice(1).trim(); continue; }
      const f = line.trim();
      if (f && cur && !map.has(f)) map.set(f, cur);
    }
    return map;
  } catch { return null; }
}
function mtimeDate(root, rel) { try { return fs.statSync(path.join(root, rel)).mtime.toISOString().slice(0, 10); } catch { return null; } }

/** 직전 회고 기록(순수-ish): plan/analytics 의 ANL-00<x>_retro_* 중 최신 → {file, date, letter, snap}. */
function latestRecord(root) {
  let files = [];
  try { files = fs.readdirSync(path.join(root, '.union-stack/plan/analytics')).filter(f => RETRO_RE.test(f)); } catch { return null; }
  if (!files.length) return null;
  files.sort((a, b) => a.match(RETRO_RE)[2].localeCompare(b.match(RETRO_RE)[2]) || a.localeCompare(b));
  const f = files[files.length - 1];
  const m = f.match(RETRO_RE);
  const front = readFront(path.join(root, '.union-stack/plan/analytics', f));
  let txt = '';
  try { txt = fs.readFileSync(path.join(root, '.union-stack/plan/analytics', f), 'utf8'); } catch { /* 없음 */ }
  return { file: f, letter: m[1], date: `${m[2].slice(0, 4)}-${m[2].slice(4, 6)}-${m[2].slice(6, 8)}`, snap: parseSnapshot(txt), status: front.status };
}

/** frontmatter 의 snap_<key>: <n> 들(순수). wo_total 도 포함. */
function parseSnapshot(txt) {
  const fm = String(txt || '').match(/^(?:\s|<!--[\s\S]*?-->)*---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return null;
  const snap = {};
  // -1 은 "값 없음" 표식(기준 없음 등) — 스냅샷에 싣지 않는다(Δ 가 -1→n 으로 읽히면 안 된다).
  for (const m of fm[1].matchAll(/^snap_(\w+):\s*(-?\d+(?:\.\d+)?)\s*$/gm)) if (+m[2] >= 0) snap[m[1]] = +m[2];
  const wt = fm[1].match(/^wo_total:\s*(\d+)\s*$/m);
  if (wt) snap.woTotal = +wt[1];
  return snap;
}

/** 다음 회차 ID 글자(순수): 기존 글자들의 다음(l·o 제외). */
function nextLetter(existing) {
  const idx = existing.map(l => LETTERS.indexOf(l)).filter(i => i >= 0);
  const next = idx.length ? Math.max(...idx) + 1 : 0;
  return LETTERS[next] || null;
}

/** 수집(읽기 전용). */
function gather(root = path.resolve(__dirname, '..')) {
  const cfg = loadAdapter(root);
  const index = buildIndex(root);
  const wos = gatherWos(root).filter(w => !w.malformed);
  const sprintDates = gitDates(root, '.union-stack/sprint') || new Map();
  const lsnDates = gitDates(root, '.union-stack/reference/lessons');
  const dateOf = rel => sprintDates.get(rel) || mtimeDate(root, rel);
  const dateSource = sprintDates.size ? 'git' : 'mtime';
  const today = localDate();
  const active = wos.filter(w => !TERMINAL.has(w.status));
  const stale = active.map(w => ({ id: w.id, days: daysBetween(dateOf(w.file) || today, today) })).filter(s => s.days != null);
  const archiveDebt = wos.filter(w => TERMINAL.has(w.status) && !/\/archived\//.test(w.file)).length;
  const woDates = wos.map(w => dateOf(w.file)).filter(Boolean).sort();
  const latestWoDate = woDates.length ? woDates[woDates.length - 1] : null;
  const children = index.filter(d => ['WO', 'PLAN', 'WF'].includes(d.domain));
  const gcPlans = index.filter(d => d.domain === 'PLAN' && !TERMINAL.has(d.status)).filter(p => {
    const kids = children.filter(c => c !== p && ((c.arithmetic !== false && isDescendant(p.id, c.id) && c.id !== p.id) || (c.parents || []).includes(`PLAN-${p.id}`)));
    return kids.length > 0 && kids.every(k => TERMINAL.has(k.status));
  }).map(p => p.id);
  const readIf = rel => { try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return ''; } };
  const planes = PLANES.map(p => ({ name: p.name, last: lastDateIn(readIf(p.rel)) }));
  const generated = GENERATED.map(p => ({ name: p.name, last: lastDateIn(readIf(p.rel)) }));
  let lsnLast = null;
  if (lsnDates && lsnDates.size) lsnLast = [...lsnDates.values()].sort().pop();
  else { try { lsnLast = fs.readdirSync(path.join(root, '.union-stack/reference/lessons')).filter(f => f.endsWith('.md') && !f.endsWith('_GUIDE.md')).map(f => mtimeDate(root, `.union-stack/reference/lessons/${f}`)).filter(Boolean).sort().pop() || null; } catch { lsnLast = null; } }
  const distillClosed = wos.filter(w => TERMINAL.has(w.status) && (!lsnLast || (dateOf(w.file) || today) > lsnLast)).length;
  let ledgerKb = 0;
  try { ledgerKb = +(fs.statSync(path.join(root, ledger.HEAD)).size / 1024).toFixed(1); } catch { ledgerKb = 0; }
  const prev = latestRecord(root);
  const input = { woTotal: wos.length, prev, archiveDebt, stale, gcPlans, planes, generated, latestWoDate, distillClosed, lsnLast, ledgerKb, dateSource,
    statusDist: wos.reduce((m, w) => { m[w.status || '(없음)'] = (m[w.status || '(없음)'] || 0) + 1; return m; }, {}) };
  return { ...computeIndicators(input, cfg), input, prevRecord: prev ? prev.file : null };
}

/** 회차 기록 초안(순수) — frontmatter 스냅샷 + 체크리스트 8 + 후보 자리. 사람이 수행·보류를 채운다. */
function renderRecord(r, { letter, date, parentRef = 'PRO-25' }) {
  const ymd = date.replace(/-/g, '');
  const snap = r.indicators.map(i => `snap_${i.key}: ${i.value == null ? -1 : i.value}`).join('\n');
  const dist = Object.entries(r.input.statusDist).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · ');
  const rows = r.indicators.map(i => `| ${i.name} | ${i.value == null ? '—' : i.value} | ${i.threshold} | ${i.over ? '**초과**' : '—'} | ${i.note} |`).join('\n');
  const delta = r.delta.length ? r.delta.map(d => `| ${d.name} | ${d.prev} | ${d.now} | ${d.now - d.prev >= 0 ? '+' : ''}${d.now - d.prev} |`).join('\n') : null;
  return [
    '<!-- [Raw/append-only] 회고 회차 기록([PRO-25] ④) — 예시 아님(실회차). 절대 재작성 금지, 다음 회차는 새 파일. -->',
    '---', `id: ANL-00${letter}`, `title: 회고 ${date} — PO 판정 묶음 + 정리`, 'status: Logged', `parent: ${parentRef}`, `retro_date: ${date}`,
    `wo_total: ${r.input.woTotal}`, snap, `date_source: ${r.dateSource}`, '---', '',
    `# [ANL-00${letter}] 회고 ${date}`, '',
    `## 1. 지표 스냅샷 (${r.due ? '회고 사유: ' + r.reasons.join(' · ') : '초과 없음'})`, '',
    '| 지표 | 값 | 임계 | 판정 | 비고 |', '|---|---|---|---|---|', rows, '',
    `WO 상태 분포: ${dist || '—'}`, '',
    ...(delta ? ['## 1-bis. 직전 회고 대비 Δ', '', '| 지표 | 직전 | 이번 | Δ |', '|---|---|---|---|', delta, ''] : []),
    '## 2. 체크리스트 (사람이 수행·보류를 채운다 — [PRO-25] §3 ③ v0.2)', '',
    '| # | 항목 | 수행 | 보류·사유 |', '|---|---|---|---|',
    '| 1 | 보관: sprint/ 의 Closed WO → archived/, `work-close --table --write` | | |',
    '| 2 | **PO 판정 묶음**: Verifying WO 를 사람이 Closed / Active 로(근거 1줄) | | |',
    '| 3 | 상위 축 흔적: closed_by 가 가리킨 축에 실제 행(별칭 맵 적용) | | |',
    '| 4 | PLAN GC: 자식 전부 terminal 인 PLAN → Crystallized — **일괄 2a 승인**(원장 1행) | | |',
    '| 5 | 교훈 후보: 같은 꼴 실패 2~3회 → LSN 후보 목록(승격은 사람) | | |',
    '| 6 | 전략 후보: PLAN superseded·의존성 변경 → HISTORY 후보 | | |',
    '| 7 | 위생: 원장 회전([PRO-18]) · Proposed 로 오래된 PRO 목록 | | |',
    '| 8 | 기록: 이 파일(append-only) | | |', '',
    '## 3. 후보 목록', '', '- LSN 후보: (없음)', '- HISTORY 후보: (없음)', '- 오래된 PRO: (없음)', '',
    '## 4. 다음 회고 조건', '', `- 지표가 다시 임계를 넘을 때(\`node scripts/retro.js\`). 임계 조정은 \`adapter.json retro:\`.`, '',
  ].join('\n');
}

function resolveRoot(argv, dflt) { const i = argv.indexOf('--root'); if (i < 0) return dflt; const v = argv[i + 1]; return v && !v.startsWith('--') ? path.resolve(v) : null; }

function run(argv = process.argv.slice(2)) {
  const root = resolveRoot(argv, path.resolve(__dirname, '..'));
  if (!root || !fs.existsSync(path.join(root, '.union-stack'))) { console.error('retro: --root 가 .union-stack 을 갖지 않는다 — 측정 대상 아님.'); return OUTCOME.CLARIFY; }
  const r = gather(root);
  if (argv.includes('--record')) {
    const dir = path.join(root, '.union-stack/plan/analytics');
    let existing = [];
    try { existing = fs.readdirSync(dir).filter(f => RETRO_RE.test(f)).map(f => f.match(RETRO_RE)[1]); } catch { /* 없음 */ }
    const letter = nextLetter(existing);
    if (!letter) { console.error('retro: 회차 글자가 바닥났다(ANL-00z) — 계보 재설계가 필요하다.'); return OUTCOME.CLARIFY; }
    const date = localDate();
    const txt = renderRecord(r, { letter, date, parentRef: argv.includes('--adopter') ? 'up:PRO-25' : 'PRO-25' });
    if (argv.includes('--write')) {
      const file = path.join(dir, `ANL-00${letter}_retro_${date.replace(/-/g, '')}.md`);
      if (fs.existsSync(file)) { console.error(`retro: 오늘 회차 기록이 이미 있다 — ${path.basename(file)} (append-only: 새 회차는 새 날짜)`); return OUTCOME.CLARIFY; }
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, txt);
      console.log(`retro: 회차 기록 초안 작성 → .union-stack/plan/analytics/${path.basename(file)} (체크리스트 수행·보류는 사람이 채운다)`);
      return OUTCOME.PASS;
    }
    process.stdout.write(txt);
    return OUTCOME.PASS;
  }
  if (argv.includes('--proposal')) { console.log(r.due ? `- 회고 제안 — ${r.reasons.join(' · ')}([PRO-25] ②, \`node scripts/retro.js\`)` : '(회고 사유 없음)'); return r.due ? OUTCOME.CLARIFY : OUTCOME.PASS; }
  if (argv.includes('--json')) { const { input, ...rest } = r; console.log(JSON.stringify({ ...rest, woTotal: input.woTotal, statusDist: input.statusDist }, null, 2)); return r.due ? OUTCOME.CLARIFY : OUTCOME.PASS; }
  console.log(`# retro due — 지표 7 (날짜 출처: ${r.dateSource}${r.prevRecord ? ` · 직전 회고 ${r.prevRecord}` : ' · 회고 기록 없음'})\n`);
  for (const i of r.indicators) console.log(`  ${i.over ? '!' : '·'} ${i.name.padEnd(9)} ${String(i.value == null ? '—' : i.value).padStart(5)} / 임계 ${String(i.threshold).padEnd(4)} ${i.note}`);
  if (r.delta.length) console.log(`\n직전 대비 Δ: ${r.delta.map(d => `${d.name} ${d.prev}→${d.now}`).join(' · ')}`);
  if (r.due) { console.error(`\nCLARIFY — 회고 제안: ${r.reasons.join(' · ')}. HANDOFF §4 에 "회고 제안 — 사유" 한 줄을 쓰고, 사람이 세션을 연다([PRO-25] ②).`); return OUTCOME.CLARIFY; }
  console.log('\n회고 사유 없음.');
  return OUTCOME.PASS;
}

module.exports = { computeIndicators, thresholds, parseSnapshot, nextLetter, renderRecord, latestRecord, gather, run, CONTRACT, DEFAULTS, TERMINAL, RETRO_RE };

if (require.main === module) process.exit(withContract(CONTRACT, argv => run(argv))());
