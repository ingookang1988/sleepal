#!/usr/bin/env node
// scripts/work-close.js
// 작업 종료 의례 — 진입 의례(upward-fetch)의 거울. [PRO-15] · [TOOL-23]
//
// 진입에는 3중 장치(upward-fetch·check-prereqs·blast-radius)가 있었으나 종료에는 0이었다.
// 그 결과 WO는 시작될 수는 있어도 *닫힐* 수 없었고, `plan/_GUIDE`의 GC 조건
// ("계보의 모든 후속이 terminal")이 판정 불가라 PLAN은 영원히 Crystallized에 닿지 못했다.
//
// 두 표면(로직 1벌):
//   <WO-ID>   닫힘 점검 — 상위 축 흔적·증거를 검사하고 미충족을 CLARIFY로 표면화(차단 없음).
//   --table   sprint/next.md 작업대 뷰 재생성 — 활성 WO만. 상태 정본은 WO 문서 frontmatter 하나뿐이며
//             표는 파생 뷰다(`plan/_GUIDE`: "수명주기를 디렉터리에도 인코딩하지 마라 — 중복은 드리프트").
//
// read-only · zero-dep (--table 시에만 next.md 기록).
const fs = require('fs');
const path = require('path');
const { walkFiles } = require('./fs_walk');
const { parse, ancestorChain } = require('./zfs_util');
const { withContract, OUTCOME, toShellExit } = require('./gate-contract');

const SPRINT_DIR = '.union-stack/sprint';
const NEXT = '.union-stack/sprint/next.md';
const BLOCK_RE = /(<!-- worktable:begin[^\n]*-->)\r?\n([\s\S]*?)(<!-- worktable:end -->)/;

/** 활성 = 작업대에 오르는 상태. Closed 는 뷰에서 자동으로 빠진다(행 제거가 절차가 아니라 부수효과). */
const ACTIVE = new Set(['Draft', 'Active', 'Verifying']);

/** 상위 축 흔적의 후보 — work-close 가 "여기에 반영했나"를 묻는 곳. */
const TRACE_CANDIDATES = [
  '.union-stack/feature/live.md',
  '.union-stack/verification/derived/state.md',
  '.union-stack/verification/derived/gap.md',
  '.union-stack/reference/contracts/',
];

const CONTRACT = {
  gate: 'Work Close Gate (work-close)',
  input: 'sprint/ 의 WO-* 문서 frontmatter(status·evidence·closed_by) + closed_by 가 가리킨 파일 본문',
  predicate: '닫는 WO 는 상위 축 흔적 1곳 이상 + 증거 명시(값 또는 `none — 이유`)를 가지며, 흔적은 실재한다',
  scope: '흔적의 *존재*만 본다 — 반영 내용이 옳은지, 작업이 실제로 완료됐는지는 판정하지 않는다',
  outcomes: ['PASS', 'CLARIFY'],
  failure_mode: '미충족을 stderr 로 표면화하고 CLARIFY(3) — 작업 종료를 막지 않는다',
};

/** frontmatter 원문 추출(순수). 없으면 null. */
function frontmatter(txt) {
  const m = String(txt || '').match(/^(?:\s|<!--[\s\S]*?-->)*---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : null;
}

/** 스칼라 필드(순수). 따옴표는 벗긴다. */
function field(fm, key) {
  const m = String(fm || '').match(new RegExp('^[ \\t]*' + key + ':[ \\t]*(.*)$', 'm'));
  if (!m) return null;
  return m[1].trim().replace(/^["']|["']$/g, '').trim() || null;
}

/** 리스트 필드(순수). 인라인 `[a, b]` 와 블록 `- a` 를 모두 받는다. */
function listField(fm, key) {
  const s = String(fm || '');
  const inline = s.match(new RegExp('^[ \\t]*' + key + ':[ \\t]*\\[(.*?)\\][ \\t]*$', 'm'));
  if (inline) {
    return inline[1].split(',').map(x => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  }
  const head = s.match(new RegExp('^[ \\t]*' + key + ':[ \\t]*$', 'm'));
  if (!head) return [];
  // head[0]은 `$`(m 플래그)로 줄 끝에서 끝나므로 잔여물의 첫 조각은 항상 빈 문자열이다 — 버린다.
  const rest = s.slice(head.index + head[0].length).split(/\r?\n/).slice(1);
  const out = [];
  for (const line of rest) {
    const item = line.match(/^[ \t]*-[ \t]+(.*)$/);
    if (!item) break;
    const v = item[1].trim().replace(/^["']|["']$/g, '');
    if (v) out.push(v);
  }
  return out;
}

/** WO 문서 텍스트 → 레코드(순수). WO 가 아니거나 frontmatter 없으면 null. */
function parseWo(relFile, txt) {
  const base = relFile.split('/').pop();
  const p = parse(base);
  if (!p || p.domain !== 'WO') return null;
  const fm = frontmatter(txt);
  if (!fm) return { id: p.id, file: relFile, status: null, parent: null, evidence: null, closed_by: [], malformed: true };
  return {
    id: p.id,
    file: relFile,
    title: field(fm, 'title'),
    status: field(fm, 'status'),
    parent: field(fm, 'parent'),
    evidence: field(fm, 'evidence'),
    closed_by: listField(fm, 'closed_by'),
    malformed: false,
  };
}

/** 이 WO(또는 조상)를 가리키는 브래킷 참조가 텍스트에 있는가(순수). */
function mentionsLineage(txt, woId) {
  const ids = [woId, ...ancestorChain(woId).slice(1)];
  return ids.some(id => new RegExp('\\[[A-Z]{2,6}-' + id.replace(/[-]/g, '\\-') + '\\]').test(String(txt || '')));
}

/**
 * 닫힘 점검(순수). traceTexts: {경로: 본문} — 호출부가 읽어 넘긴다.
 * siblings: 같은 부모를 공유하는 WO 레코드들(부모 전이 후보 판정용).
 */
function checkClosure(wo, traceTexts = {}, siblings = []) {
  const issues = [];
  if (!wo || wo.malformed) {
    issues.push({ code: 'no-frontmatter', outcome: 'CLARIFY', msg: 'WO 문서에 frontmatter 가 없다 — status·evidence·closed_by 를 읽을 수 없다.' });
    return { issues, info: [] };
  }
  if (!wo.closed_by.length) {
    issues.push({
      code: 'no-trace', outcome: 'CLARIFY',
      msg: '상위 축 흔적(closed_by)이 비었다. 후보: ' + TRACE_CANDIDATES.join(' · '),
    });
  }
  for (const p of wo.closed_by) {
    const txt = traceTexts[p];
    if (txt == null) {
      issues.push({ code: 'trace-missing', outcome: 'CLARIFY', msg: `closed_by 가 가리킨 파일을 읽을 수 없다: ${p}` });
    } else if (!mentionsLineage(txt, wo.id)) {
      // 선언만 하고 반영하지 않은 경우 — 흔적을 *확인 가능한 사실*로 만드는 검사.
      issues.push({ code: 'trace-unreferenced', outcome: 'CLARIFY', msg: `${p} 에 이 계보(${wo.id}) 참조가 없다 — 선언만 하고 반영하지 않았는가?` });
    }
  }
  if (!wo.evidence) {
    issues.push({
      code: 'no-evidence', outcome: 'CLARIFY',
      msg: '증거(evidence)가 비었다. 값을 적거나, 없으면 `none — 이유`로 명시하라(미기입과 해당없음의 구별).',
    });
  }
  const info = [];
  const others = siblings.filter(s => s.id !== wo.id);
  if (others.length && others.every(s => s.status === 'Closed')) {
    info.push(`부모(${wo.parent || ancestorChain(wo.id)[1] || '?'})의 자식 WO 가 모두 Closed 다 — PLAN status 전이 후보(강제 아님).`);
  }
  return { issues, info };
}

/** 활성 WO 목록 → 작업대 표 본문(순수, id 정렬). */
function buildTable(wos) {
  const rows = wos
    .filter(w => w && ACTIVE.has(w.status))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(w => {
      const parent = w.parent || ancestorChain(w.id)[1] || '—';
      const ev = w.evidence ? (/^none\b/i.test(w.evidence) ? '해당없음' : '있음') : '—';
      return `| [WO-${w.id}] | ${w.title || '—'} | ${parent} | ${w.status} | ${ev} |`;
    });
  const head = '| WO | 제목 | 부모 | 상태 | 증거 |\n|---|---|---|---|---|';
  return rows.length ? `${head}\n${rows.join('\n')}` : `${head}\n| — | 활성 WO 없음 | — | — | — |`;
}

/** next.md 마커 블록에 주입(순수). 마커 없으면 null. 지배적 EOL 보존. */
function inject(nextTxt, table) {
  if (!BLOCK_RE.test(nextTxt)) return null;
  const eol = (nextTxt.match(/\r\n/g) || []).length > (nextTxt.match(/(?<!\r)\n/g) || []).length ? '\r\n' : '\n';
  const body = table.split('\n').join(eol);
  return nextTxt.replace(BLOCK_RE, (_, b, __, e) => `${b}${eol}${body}${eol}${e}`);
}

function gather(root = path.resolve(__dirname, '..')) {
  const out = [];
  walkFiles(root, SPRINT_DIR, rel => {
    if (!rel.endsWith('.md')) return;
    let rec = null;
    try { rec = parseWo(rel, fs.readFileSync(path.join(root, rel), 'utf8')); } catch { rec = null; }
    if (rec) out.push(rec);
  });
  return out;
}

function readTraces(root, paths) {
  const out = {};
  for (const p of paths) {
    try { out[p] = fs.readFileSync(path.join(root, p), 'utf8'); } catch { /* 읽기 실패는 checkClosure 가 판정 */ }
  }
  return out;
}

function run(argv = process.argv.slice(2), root = path.resolve(__dirname, '..')) {
  const wos = gather(root);
  const json = argv.includes('--json');

  if (argv.includes('--table')) {
    const nextPath = path.join(root, NEXT);
    const current = fs.readFileSync(nextPath, 'utf8');
    const expected = inject(current, buildTable(wos));
    if (expected === null) {
      console.error('work-close: next.md 에 마커 블록(<!-- worktable:begin/end -->)이 없음 — 블록을 먼저 추가하라.');
      return OUTCOME.CLARIFY;
    }
    if (argv.includes('--write')) {
      if (expected !== current) { fs.writeFileSync(nextPath, expected); console.log('work-close: next.md 작업대 뷰 갱신.'); }
      else console.log('work-close: 작업대 뷰 이미 최신.');
      return OUTCOME.PASS;
    }
    if (expected !== current) {
      console.error('work-close: next.md 작업대 뷰가 WO 문서와 불일치(드리프트) — `node scripts/work-close.js --table --write` 실행.');
      return OUTCOME.CLARIFY;
    }
    console.log(`work-close 통과: 활성 WO ${wos.filter(w => ACTIVE.has(w.status)).length}건, 작업대 뷰 동기화됨.`);
    return OUTCOME.PASS;
  }

  const target = argv.find(a => !a.startsWith('--'));
  if (!target) {
    console.error('사용법: node scripts/work-close.js <WO-ID> | --table [--write]');
    return OUTCOME.CLARIFY;
  }
  const id = target.replace(/^WO-/, '');
  const wo = wos.find(w => w.id === id);
  if (!wo) {
    console.error(`work-close: WO-${id} 문서를 ${SPRINT_DIR} 에서 찾지 못했다.`);
    return OUTCOME.CLARIFY;
  }
  const parentId = wo.parent || ancestorChain(wo.id)[1] || null;
  const siblings = wos.filter(w => (w.parent || ancestorChain(w.id)[1] || null) === parentId);
  const { issues, info } = checkClosure(wo, readTraces(root, wo.closed_by), siblings);

  if (json) { console.log(JSON.stringify({ wo, issues, info }, null, 2)); return issues.length ? OUTCOME.CLARIFY : OUTCOME.PASS; }

  console.log(`# work-close ${target} — status: ${wo.status || '(미기입)'}`);
  if (info.length) info.forEach(i => console.log(`  · ${i}`));
  if (!issues.length) {
    console.log(`  ✓ 닫힘 조건 충족 — 흔적 ${wo.closed_by.length}곳 · 증거 명시됨.`);
    console.log('  → 세션 종료 시 이 문서를 .union-stack/sprint/archived/ 로 옮기고 `--table --write` 로 뷰를 갱신하라([PRO-15]).');
    return OUTCOME.PASS;
  }
  console.error('\n[work-close] 닫힘 조건 미충족 (CLARIFY — 차단하지 않는다):');
  issues.forEach(i => console.error(`  ? ${i.code}: ${i.msg}`));
  return OUTCOME.CLARIFY;
}

module.exports = {
  frontmatter, field, listField, parseWo, mentionsLineage, checkClosure, buildTable, inject, gather,
  CONTRACT, ACTIVE, TRACE_CANDIDATES,
};

if (require.main === module) process.exit(toShellExit(withContract(CONTRACT, run)()));
