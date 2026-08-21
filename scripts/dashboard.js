#!/usr/bin/env node
// scripts/dashboard.js
// 평면 대시보드 — 관측 표면 전부를 자기완결 HTML 1장으로 합성한다. [TOOL-25]
//
// 합성이지 계산이 아니다: 4개 도구의 기존 export 를 소비만 한다(로직 1벌, 표면 N개).
//   health.gather()        → 게이트 + 관측 절(effect surface·tier 등)   [TOOL-04]
//   context-budget.gather()→ 부트스트랩 토큰 예산                        (scripts/context-budget.js)
//   work-close.gather()    → WO 작업대(활성 판정은 export 된 ACTIVE)     [TOOL-23]
//   lineage-tree.planeBody → 계보 트리 + 상태 필터(CSS/JS 공유)          [TOOL-24]
// 어답터 평면 무가정은 각 소스 도구가 이미 보장한다 — 여기서는 그 출력을 그리기만 한다.
// 섹션 함수는 전부 순수(데이터 → HTML 조각). FS 는 gather 호출부와 --out 쓰기뿐.
// zero-dep 자기완결(인라인 CSS/JS, CDN 0) · 산출물은 gitignore(dashboard.html).
//
// 실행: node scripts/dashboard.js [--json] [--out <path>]
const fs = require('fs');
const path = require('path');
const { buildIndex } = require('./zfs_index');
const { gather: gatherHealth } = require('./health');
const { gather: gatherBudget } = require('./context-budget');
const { gather: gatherWos, checkClosure, frontmatter, field, ACTIVE } = require('./work-close');
const { analyze: analyzeHandoff, partBody: handoffPart, HANDOFF_PATH } = require('./handoff-linter');
const { parseLedger, gather: gatherBlocks } = require('./blocks-index');
const { read: readLedger } = require('./ledger');
const { parseEntries: parseHistory } = require('./history-linter');
const { walkFiles } = require('./fs_walk');
const { LOCKED } = require('./query');
const { planeBody, PLANE_CSS, FILTER_JS } = require('./lineage-tree');

/** frontmatter 유래 자유 문자열 이스케이프(lineage-tree 와 동일 규칙). */
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 볼드 쌍은 **줄바꿈을 넘을 수 있으나 빈 줄(문단 경계)은 못 넘는다**. 평면 산문은 편집기 폭에
// 맞춰 100자쯤에서 접히므로 강조가 접힌 줄에 걸치는 것이 흔하고(실측: HANDOFF §4), 문단 경계를
// 막지 않으면 짝 없는 마커 하나가 문서 절반을 삼킨다.
const BOLD_RE = /\*\*(?=\S)((?:[^\n]|\n(?!\s*\n))+?)\*\*/g;

/**
 * 인라인 마커: 코드 → 볼드 순(순수). **코드 스팬 안의 마커는 보존한다** — 코드는 문자 그대로가 뜻이다.
 * 짝이 맞지 않는 마커(`**볼드 열고 안 닫음`)는 손대지 않아 이스케이프된 원문으로 남는다.
 *
 * 자리표시자로 `<n>` 을 쓰는 이유: 입력은 **이미 esc() 를 거친 문자열**이라 날 `<` 가 존재할 수
 * 없다. 충돌이 원리적으로 불가능하고, 제어문자 센티널처럼 소스 편집에서 사라질 위험도 없다.
 */
function proseInline(s) {
  const spans = [];
  return s
    .replace(/`([^`]+)`/g, (_, c) => `<${spans.push(c) - 1}>`)
    .replace(BOLD_RE, '<b>$1</b>')
    .replace(/<(\d+)>/g, (_, i) => `<code>${spans[+i]}</code>`);
}

/**
 * 잘린 조각의 **짝 없는 마커를 닫는다**(순수). 절단이 만든 소음이지 원문의 뜻이 아니다 —
 * 자른 자리가 코드 스팬·볼드 한가운데면 여는 마커만 남아 `prose()` 의 안전 폴백(모르는 문법은
 * 원문 유지)에 걸려 그대로 노출된다.
 *
 * **떼어내지 않고 닫는 이유**: 마커 경계까지 물러나는 첫 구현은 여는 마커가 맨 앞일 때
 * (`**제목 전체가 볼드**` 꼴) 텍스트를 통째로 지웠다 — 실측상 빈 문자열 + 말줄임만 남는다.
 * 닫으면 내용이 한 글자도 안 없어지고 조각이 의도대로(굵게/코드로) 읽힌다. 절단의 목적은
 * 짧게 보여주는 것이지 지우는 것이 아니다.
 */
function closeDanglingMarker(t) {
  let s = String(t).replace(/\s+$/, '');
  if ((s.split('`').length - 1) % 2) s += '`';
  if ((s.split('**').length - 1) % 2) s += '**';
  return s;
}

/** 길이 절단(순수): n자 초과면 자른 뒤 깨진 마커를 닫고 말줄임을 붙인다. */
function clip(t, n) {
  const s = String(t == null ? '' : t);
  return s.length > n ? `${closeDanglingMarker(s.slice(0, n))}…` : s;
}

/**
 * 원장 산문 → 요지(순수). **절단은 두 번 일어난다** — 구분자(` — `)에서 한 번, 길이에서 한 번.
 * 둘 다 마커 쌍을 반으로 자를 수 있으므로 **자른 쪽이 자기가 깨뜨린 마커를 수습한다**.
 *
 * 길이 절단만 수습하던 첫 구현은 어답터 원장에서 15건을 노출했다(실측): 그쪽 관례가
 * `**제목 — 부제**` 라 볼드가 구분자를 감싸는데, 구분자에서 자르면 여는 `**` 만 남고 조각이
 * 상한보다 짧아 `clip` 이 손댈 기회조차 없었다. 상류 관례는 `**제목** — 부제` 라 안 걸린다 —
 * 자기 데이터 형상만 도는 도구의 전형적 사각지대([LSN-17]).
 *
 * 자르지 않았으면 손대지 않는다 — 원문의 짝 없는 마커는 작성자의 것이고 `prose` 의 안전 폴백 소관이다.
 */
function gistOf(text, n) {
  const s = String(text == null ? '' : text);
  const i = s.indexOf(' — ');
  const head = i >= 0 ? s.slice(0, i) : s;
  const out = clip(head, n);
  return out === head && i >= 0 ? closeDanglingMarker(head) : out;
}

/**
 * **평면 산문 인용 전용** 미니 마크다운(순수). 풀 렌더러가 아니다 — zero-dep 자기완결이 이 도구의
 * 불변식이고, HANDOFF·원장 같은 산문에서 실제로 소음이 되는 문법은 넷뿐이다:
 * 인라인 코드 · 볼드 · 행두 인용(`>`) · 행두 헤딩(`#`).
 *
 * 관객이 PO 인 표면에서 `> ### 🎯 **…**` 가 문자 그대로 보이면 하네스 문법을 모르는 독자에겐
 * 순수한 소음이다(실측: 제품 축 진입점 카드). 반대로 **이해 못 하는 문법은 원문 그대로 남긴다** —
 * 오렌더보다 원문 노출이 낫다는 기존 성질의 보존이고, 그래서 이 함수는 실패할 수 없다(부분 변환이
 * 곧 정상 동작이다).
 *
 * **순서가 계약이다**: ①`esc()` 로 전부 이스케이프(주입 표면 0 — 살아남는 태그는 여기서 만든 것뿐)
 * → ②인라인 변환을 **전문에 한 번**(줄 단위로 돌리면 접힌 줄에 걸친 볼드가 갈려 원문이 노출된다)
 * → ③줄 단위로 행두 마커(인용·헤딩) 처리 → ④`<br>` 로 잇기.
 * ⚠ 속성값(`title="…"`)에는 쓰지 마라 — 태그가 들어가면 안 되는 자리이므로 거긴 `esc` 가 정본이다.
 */
function prose(txt) {
  return proseInline(esc(String(txt == null ? '' : txt))).split('\n').map(line => {
    const quoted = /^&gt;\s?/.test(line);   // esc 이후라 인용 마커는 '&gt;' 다
    const body = quoted ? line.replace(/^&gt;\s?/, '') : line;
    const h = body.match(/^#{1,6}\s+(.*)$/);
    // 헤딩 줄은 통째로 굵어지므로 안쪽 볼드는 벗긴다(`<b>` 중첩은 의미가 없다). `<code>` 는 남긴다.
    const out = h ? `<b>${h[1].replace(/<\/?b>/g, '')}</b>` : body;
    return quoted ? `<span class="q">${out}</span>` : out;
  }).join('<br>');
}

// health 판정 마크 — 색은 dataviz 예약 status 팔레트(계열색과 절대 공유 금지), 항상 글리프+단어 동반.
const MARKS = {
  OK: { glyph: '✓', color: '#067647' },
  FAIL: { glyph: '✗', color: '#b42318' },
  WARN: { glyph: '!', color: '#b54708' },
  INFO: { glyph: '·', color: '#6b7280' },
};

/** 4표면 → 스탯 타일 행(순수). 집계는 표현층 계수뿐 — planeBody 의 meta 라인과 같은 급. */
function tilesSection({ index, health, budget, wos }) {
  const active = wos.filter(w => !w.malformed && ACTIVE.has(w.status));
  const locked = index.filter(d => LOCKED.has(d.status)).length;
  const domains = new Set(index.map(d => d.domain)).size;
  const tile = (label, value, sub, cls = '') =>
    `<div class="tile"><div class="tl">${label}</div><div class="tv ${cls}">${value}</div><div class="ts">${sub}</div></div>`;
  return `<div class="tiles">
${tile('문서', index.length, `${domains} domains`)}
${tile('게이트', health.fails === 0 ? '통과' : `${health.fails} 실패`, health.warns ? `WARN ${health.warns}` : 'WARN 0', health.fails === 0 ? 'good' : 'bad')}
${tile('활성 WO', active.length, locked ? `\u{1F512} ${locked} Verifying` : '잠금 0', locked ? 'warn' : '')}
${tile('부트스트랩', budget.total, `/ ${budget.totalCap} tok${budget.over ? ` · 초과 ${budget.over}` : ''}`, budget.over ? 'bad' : '')}
</div>`;
}

/** health.gather() 결과 → 게이트/관측 표(순수). */
function healthSection(h) {
  const tr = d => {
    const m = MARKS[d.status] || MARKS.INFO;
    return `<tr><td class="mk" style="color:${m.color}">${m.glyph} ${esc(d.status)}</td>`
      + `<td class="nm">${esc(d.name)}</td><td>${esc(d.value)}${d.note ? `<span class="note"> — ${esc(d.note)}</span>` : ''}</td></tr>`;
  };
  const dist = Object.entries(h.byDomain).map(([k, v]) => `${k}:${v}`).join(' ');
  const verdict = h.healthy
    ? `<span class="ok">게이트 전부 통과</span>`
    : `<span class="bad">게이트 ${h.fails}건 실패</span>`;
  return `<section class="card" id="health"><h2>Health — 게이트 + 관측</h2>
  <div class="meta">${verdict}${h.warns ? ` · WARN ${h.warns}` : ''} · 도메인 분포: ${esc(dist)}</div>
  <table class="tbl">${h.dims.map(tr).join('\n')}</table></section>`;
}

/** context-budget.gather() 결과 → 예산 바(순수). */
function budgetSection(b) {
  const bar = r => {
    const pct = Math.min(100, Math.round((r.tokens / r.budget) * 100));
    const over = r.status === 'OVER';
    return `<div class="brow"><span class="bnm">${esc(r.name)}</span>`
      + `<span class="bbar"><span class="bfill${over ? ' bover' : ''}" style="width:${pct}%"></span></span>`
      + `<span class="bval${over ? ' bad' : ''}">${r.tokens}/${r.budget}${over ? ' OVER' : ''}</span></div>`;
  };
  return `<section class="card" id="budget"><h2>Bootstrap 예산 — 상시 주입 토큰</h2>
  <div class="meta">총합 ${b.total}/${b.totalCap} tok${b.over ? ` · <span class="bad">초과 ${b.over}건</span>` : ''}</div>
  ${b.rows.map(bar).join('\n')}</section>`;
}

/** health.gather().sizes → 크기 헤드룸 바(순수, 상위 N건).
 *  불리언 게이트(`0 > 30KB`)는 상한을 *넘는 순간*에만 말한다. append-only 원장처럼 줄어들 수
 *  없는 파일은 임박을 미리 봐야 분할·로테이션을 제때 결정할 수 있다. */
function sizeSection(sizes = [], capKb = 30, top = 6) {
  if (!sizes.length) return '';
  const rowsHtml = sizes.slice(0, top).map(s => {
    const pct = Math.min(100, Math.round((s.kb / capKb) * 100));
    const cls = s.kb > capKb ? ' bover' : pct >= 80 ? ' bnear' : '';
    return `<div class="brow"><span class="bnm sz" title="${esc(s.file)}">${esc(s.file.split('/').pop())}</span>`
      + `<span class="bbar"><span class="bfill${cls}" style="width:${pct}%"></span></span>`
      + `<span class="bval${s.kb > capKb ? ' bad' : ''}">${s.kb}KB</span></div>`;
  }).join('\n');
  const near = sizes.filter(s => s.kb <= capKb && s.kb / capKb >= 0.8).length;
  const over = sizes.filter(s => s.kb > capKb).length;
  return `<section class="card" id="size"><h2>파일 크기 헤드룸 — 상한 ${capKb}KB</h2>
  <div class="meta">${sizes.length} files · ${over ? `<span class="bad">초과 ${over}</span> · ` : ''}상한 80% 근접 ${near}건</div>
  ${rowsHtml}</section>`;
}

/** health.gather().sync → 평면 신선도(순수). 무기입은 "지연"이 아니라 *죽은 평면*이라 따로 표시. */
function syncSection(sync, today) {
  if (!sync) return '';
  const days = d => {
    const ms = Date.parse(today + 'T00:00:00Z') - Date.parse(d + 'T00:00:00Z');
    return Number.isFinite(ms) ? Math.round(ms / 86400000) : null;
  };
  const pill = p => {
    if (!p.last) return `<span class="pill dead">${esc(p.name)}<b>무기입</b></span>`;
    const n = days(p.last);
    const cls = n === null ? '' : n >= 30 ? ' stale' : n >= 7 ? ' aging' : ' fresh';
    return `<span class="pill${cls}" title="${esc(p.last)}">${esc(p.name)}<b>${n === null ? esc(p.last) : n === 0 ? '오늘' : n + '일'}</b></span>`;
  };
  const dead = sync.planes.filter(p => !p.last).length;
  return `<section class="card" id="sync"><h2>평면 신선도 — 마지막 기입<label class="more" data-nav="time" for="v-time">자세히 →</label></h2>
  <div class="meta">ledger ${sync.ledgerEntries} entries · last ${esc(sync.ledgerLast || '무기입')}`
    + `${dead ? ` · <span class="bad">무기입 ${dead}면</span>` : ''}</div>
  <div class="pills">${sync.planes.map(pill).join('')}</div></section>`;
}

/**
 * health.gather().contracts → 계약 간선 절(순수). [PRO-16]
 *
 * **그래프를 그리지 않는다.** 현재 실간선이 1건이라 화살표 하나를 그리는 꼴이고, 그건 표본 없는
 * 시각화를 기각한 기준(PLAN 히트맵·WO 종료추적)과 어긋난다. 대신 [PRO-16] §5의 반증 조건
 * ("consumers 가 실계약에 안 달리면 필드 폐기")을 **볼 계기**와, 오타 소비자가 잠금 보호를 조용히
 * 무력화하는 것을 잡는 **무결성 표면**을 낸다. 그래프는 간선이 쌓인 뒤의 일이다.
 */
function contractSection(c) {
  if (!c || !c.contracts) return '';
  const rows = c.byContract.map(x => {
    const chips = x.consumers.map(r => {
      const bad = c.unresolved.some(u => u.from === x.id && u.ref === r);
      const dup = x.redundant.includes(r);
      const cls = bad ? ' dead' : dup ? ' aging' : ' fresh';
      const tag = bad ? '미해소' : dup ? '동일계보' : '해소';
      return `<span class="pill${cls}">${esc(r)}<b>${tag}</b></span>`;
    }).join('');
    return `<div class="crow"><span class="nm" title="${esc(x.file)}">${esc(x.id)}</span>`
      + `<span class="carrow">→</span><span class="pills inline">${chips}</span></div>`;
  }).join('\n');
  const undeclared = c.contracts - c.declaring;
  return `<section class="card" id="contract"><h2>계약 간선 — 계보 밖 소비자</h2>
  <div class="meta">계약 ${c.contracts} · 선언 ${c.declaring} · 간선 ${c.edges}`
    + `${c.unresolved.length ? ` · <span class="bad">미해소 ${c.unresolved.length}</span>` : ''}`
    + `${undeclared > 0 ? ` · 미선언 ${undeclared}` : ''}</div>
  ${rows || '<div class="meta">선언된 간선 없음 — [PRO-16] §5 반증 조건 관측 대상</div>'}</section>`;
}

/**
 * 스프린트 축(actual × action) 수집 — WO 닫힘 조건 + HANDOFF 인계 상태.
 * 전부 기존 export 소비: checkClosure([TOOL-23])는 traceTexts 를 호출부가 읽어 넘기는 계약이라
 * 여기(FS 층)서 closed_by 가 가리킨 파일을 읽는다. HANDOFF 는 handoff-linter.analyze 로 판정한다.
 */
function gatherSprint(root, wos) {
  const enriched = wos.map(wo => {
    const traceTexts = {};
    for (const rel of wo.closed_by || []) {
      try { traceTexts[rel] = fs.readFileSync(path.join(root, rel), 'utf8'); } catch { /* 부재는 checkClosure 가 잡는다 */ }
    }
    const siblings = wos.filter(w => w.parent && w.parent === wo.parent);
    return { ...wo, closure: checkClosure(wo, traceTexts, siblings) };
  });
  let handoff = null;
  try {
    const txt = fs.readFileSync(path.join(root, HANDOFF_PATH), 'utf8');
    const fm = frontmatter(txt);
    handoff = {
      session: field(fm, 'session_id'), date: field(fm, 'date'),
      verification: field(fm, 'verification'), ...analyzeHandoff(txt),
    };
  } catch { /* HANDOFF 부재도 상태다 — 카드가 "없음"으로 그린다 */ }
  let archived = 0;
  walkFiles(root, '.union-stack/sprint/archived', rel => { if (/WO-.*_.*[.]md$/.test(rel)) archived++; });
  return { wos: enriched, handoff, archived };
}

/**
 * 스프린트 축 **전용 페이지**(순수). 이 축의 짝은 **종료 의례**다 — 진입에는 3중 장치
 * (upward-fetch·check-prereqs·blast-radius)가 있고 종료는 [PRO-15]의 work-close 하나다.
 * WO 는 선언으로 닫히지 않는다: 상위 축 흔적(closed_by)과 증거(evidence)가 디프에서 검사
 * 가능해야 한다. 그래서 이 페이지는 WO 마다 그 닫힘 조건의 현재 상태를 편다.
 * HANDOFF 는 세션 사이의 이어달리기(휘발·최신 하나)라 이 축의 시간 방향 절반이다.
 */
function sprintView(sprint, today) {
  if (!sprint) return '';
  const { wos, handoff, archived } = sprint;
  const active = wos.filter(w => !w.malformed && ACTIVE.has(w.status));
  const closable = active.filter(w => w.closure && !w.closure.issues.length);
  const locked = wos.filter(w => w.status === 'Verifying').length;
  const evPill = w => {
    if (!w.evidence) return '<span class="pill dead">증거<b>미기입</b></span>';
    if (/^none/.test(w.evidence.trim())) return `<span class="pill aging" title="${esc(w.evidence)}">증거<b>none — 사유 명시</b></span>`;
    return `<span class="pill fresh" title="${esc(w.evidence)}">증거<b>있음</b></span>`;
  };
  const woCard = w => {
    if (w.malformed) {
      return `<section class="card"><h2>${esc(w.file.split('/').pop())}</h2>
  <div class="meta bad">frontmatter 없음 — status·evidence·closed_by 를 읽을 수 없다</div></section>`;
    }
    const issues = (w.closure && w.closure.issues) || [];
    const infos = (w.closure && w.closure.info) || [];
    const traces = (w.closed_by || []).length
      ? w.closed_by.map(t => `<code>${esc(t.split('/').pop())}</code>`).join('')
      : '<span class="note">없음</span>';
    return `<section class="card norm">
    <h2>[WO-${esc(w.id)}] <span class="ntitle">${esc(w.title || '')}</span></h2>
    <div class="meta"><span class="pill ${w.status === 'Verifying' ? 'aging' : 'fresh'}">status<b>${esc(w.status || '없음')}</b></span>
      <span class="pill">부모<b>${esc(w.parent || '미기입')}</b></span>${evPill(w)}</div>
    <div class="frow"><span class="flabel">상위 흔적</span><span class="fvals">${traces}</span></div>
    ${issues.length
      ? `<div class="frow"><span class="flabel scope">닫힘 미충족</span><span class="fvals t">${issues.map(i => esc(i.msg)).join('<br>')}</span></div>`
      : `<div class="frow"><span class="flabel">닫힘 조건</span><span class="fvals t"><span class="ok">충족</span> — 지금 닫아도 종료 의례를 통과한다</span></div>`}
    ${infos.length ? `<div class="frow"><span class="flabel">참고</span><span class="fvals t">${infos.map(esc).join('<br>')}</span></div>` : ''}
  </section>`;
  };
  const hoCard = handoff
    ? `<section class="card"><h2>HANDOFF — 세션 이어달리기</h2>
  <div class="meta"><span class="pill ${handoff.findings.length ? 'dead' : 'fresh'}">5부<b>${handoff.findings.length ? '누락 ' + handoff.findings.length : '완비'}</b></span>
    <span class="pill">세션<b>${esc(handoff.session || '?')}</b></span>
    <span class="pill" title="${esc(handoff.date || '')}">일자<b>${esc((handoff.date || '').slice(0, 10) || '?')}</b></span></div>
  <div class="brow"><span class="bnm">tokens</span>
    <span class="bbar"><span class="bfill${handoff.tokens > handoff.budget ? ' bover' : handoff.tokens / handoff.budget >= 0.8 ? ' bnear' : ''}" style="width:${Math.min(100, Math.round((handoff.tokens / handoff.budget) * 100))}%"></span></span>
    <span class="bval${handoff.tokens > handoff.budget ? ' bad' : ''}">${handoff.tokens}/${handoff.budget}</span></div>
  ${handoff.verification ? `<div class="frow"><span class="flabel">검증란</span><span class="fvals t">${prose(handoff.verification)}</span></div>` : ''}
  </section>`
    : '<section class="card"><h2>HANDOFF</h2><div class="meta bad">없음 — 인계가 끊겨 있다</div></section>';
  return `<div class="tiles">
  <div class="tile"><div class="tl">활성 WO</div><div class="tv">${active.length}</div><div class="ts">Draft · Active · Verifying</div></div>
  <div class="tile"><div class="tl">닫힘 조건 충족</div><div class="tv ${closable.length ? 'good' : ''}">${closable.length}/${active.length}</div><div class="ts">종료 의례 통과 가능</div></div>
  <div class="tile"><div class="tl">잠금</div><div class="tv ${locked ? 'warn' : ''}">${locked}</div><div class="ts">Verifying 🔒</div></div>
  <div class="tile"><div class="tl">아카이브</div><div class="tv">${archived}</div><div class="ts">Closed 보존(삭제 금지)</div></div>
  </div>
  <section class="card"><h2>왜 이 페이지가 있는가</h2>
  <div class="meta">이 축의 짝은 <b>종료 의례</b>다 — 진입에는 3중 장치(upward-fetch·check-prereqs·blast-radius)가
  있는데 종료는 [PRO-15]의 work-close 하나다. WO 는 선언으로 닫히지 않는다: <b>상위 축 흔적(closed_by)</b>과
  <b>증거(evidence)</b>가 디프에서 검사 가능해야 한다. 아래는 WO 마다 그 닫힘 조건의 현재 상태이고,
  HANDOFF 는 이 축의 시간 방향 절반(세션 사이 이어달리기)이다.</div></section>
  ${active.map(woCard).join('')}
  ${wos.filter(w => w.malformed).map(woCard).join('')}
  ${hoCard}`;
}

// --- 제품 축 -------------------------------------------------------------
// 현행 4축(개요·당위·스프린트·시간축)의 관객은 **하네스 관리자**다 — 게이트·예산·의례·결정 밀도.
// 프로젝트를 운영하는 PO 의 네 질문에는 어느 축도 답하지 않는다: 로드맵 대비 어디까지 왔나 ·
// 뭐가 진행 중이고 뭐가 막혔나 · 최근에 뭐가 나갔나 · 리스크는 무엇인가.
// 원료는 전부 평면에 이미 있다 — 계산이 아니라 **합성 공백**이다(이 도구 자신의 설계 원칙 그대로).
//
// ⚠ 이 축은 **관측이지 판정이 아니다.** exit 기준의 충족 여부는 산문에서 추정한 휴리스틱이고
// (`✅` 표식 + 워크스트림 헤딩), Now/Next/Blocked 는 WO 의 `status:` 를 그대로 옮긴 것이다.
// 진행률을 점수로 승격시키지 않는 이유는 [PRO-11] §4(측도 금지)와 같다.

// PHASE 의 종료 상태 — 이 값들이면 "지나온 단계"로 본다.
const PHASE_TERMINAL = new Set(['Crystallized', 'Closed', 'Archived', 'Superseded', 'Rejected']);

// exit 기준 줄 — 항목이 **키워드로 시작**해야 한다. 본문의 단순 *언급*("…네 워크스트림 전부 exit
// gate 충족 →")까지 세면 진행률이 산문 밀도를 따라 부풀어 수가 뜻을 잃는다(계수기 오염).
const EXIT_LINE = /^\**\s*(?:exit(?:\s*gate)?|종료\s*조건|승격\s*게이트)\s*\**\s*[:：]\s*(.+)$/i;

/**
 * PHASE 본문 → exit 기준 체크리스트(순수 — 휴리스틱 관측).
 * 규약(roadmap/_GUIDE): "게이트는 PHASE 안의 *절*이지 자기 도메인이 아니다." 그래서 파싱 대상은
 * 자유 서술 안의 `Exit:` 줄이고, 충족 표식은 그 줄 또는 그것을 담은 워크스트림 헤딩의 `✅` 다.
 */
function parseExitCriteria(txt) {
  const lines = String(txt || '').split(/\r?\n/);
  // 완료 표식은 exit 줄에만 붙지 않는다 — 실측 문서는 워크스트림 헤딩(`### E3 … ✅`)이나 별도
  // `## 진행 상태` 절(`- **[E1] ✅ 완료** …`)에 적는다. 그래서 헤딩의 토큰(E1·E3…)을 키로 삼아
  // 문서 어디서든 그 토큰과 ✅ 가 같은 줄에 있으면 충족으로 읽는다.
  const doneTokens = new Set();
  for (const line of lines) {
    if (!line.includes('✅')) continue;
    for (const t of line.match(/\b[A-Z]\d{1,2}\b/g) || []) doneTokens.add(t);
  }
  const out = [];
  let headDone = false;
  for (const line of lines) {
    const h = line.match(/^#{2,4}\s+(.*)$/);
    if (h) {
      const tok = (h[1].match(/^\s*([A-Z]\d{1,2})\b/) || [])[1];
      headDone = /✅/.test(h[1]) || (!!tok && doneTokens.has(tok));
      continue;
    }
    if (/^\s*>/.test(line)) continue;                       // 인용문은 서술이지 기준이 아니다
    const m = line.replace(/^\s*[-*+]\s*/, '').match(EXIT_LINE);
    if (!m) continue;
    out.push({ text: m[1].trim(), done: /✅|충족|완료/.test(line) || headDone });
  }
  return out;
}

/**
 * `feature/live.md` 표 → 행 배열(순수). 구분선·빈 행·**헤더**는 버린다.
 *
 * 헤더 판정은 **"다음 줄이 구분선"**이다 — 마크다운 표의 실제 계약이고 `history-linter` 가 쓰는
 * 규칙과 같다. 헤더 *어휘*로 판정하던 첫 구현(`feature`…`status`)은 두 가지로 틀렸다:
 * ①한국어·도메인 헤더를 못 알아보고 ②파일에 표가 여럿이면 두 번째부터 전부 놓친다.
 * 실측(어답터): 존별 표 13개의 헤더가 하나도 안 걸러져 **배송 109 → 122** 로 집계됐다.
 * 표시 결함이 아니라 **PO 타일의 숫자가 틀린 것**이라 이 축에서 더 아프다.
 */
function parseLiveRows(md) {
  const lines = String(md || '').split(/\r?\n/);
  const isRow = l => /^\s*\|/.test(l);
  const cellsOf = l => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
  const isSep = l => isRow(l) && cellsOf(l).every(c => /^:?-+:?$/.test(c));
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!isRow(line) || isSep(line)) continue;
    if (isSep(lines[i + 1] || '')) continue;          // 헤더 — 다음 줄이 구분선
    const cells = cellsOf(line);
    if (!cells[0]) continue;
    rows.push({
      feature: cells[0], ref: cells[1] || '', status: cells[2] || '',
      example: /\(예시\)|\(더미\)|example|dummy/i.test(line),
    });
  }
  return rows;
}

/**
 * 제품 축 수집 — **어답터 무가정**: 평면 데이터만 소비하고 설정을 요구하지 않는다.
 * 이미 모인 축(index·wos·sprint·time·health)에서 파생만 하므로 같은 수집을 두 번 하지 않는다.
 */
function gatherProduct(root, { index, wos, sprint, time, health }) {
  const readIf = rel => { try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return ''; } };
  const phases = index.filter(d => d.domain === 'PHASE').map(d => {
    const txt = readIf(d.file);
    const fm = frontmatter(txt);
    return {
      key: `PHASE-${d.id}`, file: d.file, status: d.status || '',
      title: (fm && field(fm, 'title')) || d.slug,
      exits: parseExitCriteria(txt),
      example: /example/i.test(d.slug),
    };
  }).sort((a, b) => a.key.localeCompare(b.key));
  // 현재 단계 = 종료되지 않은 것 중 가장 뒤. 예시 문서(init 이 지우는 더미)는 실문서가 있으면 제외.
  // 전부 종료면 `current` 는 null 이다 — "마지막 단계"로 위조하지 않는다. 그건 *다음 단계 미정*이라는
  // 사실이고 PO 가 봐야 할 신호다(로드맵이 끝났는데 후속이 없다).
  const real = phases.filter(p => !p.example);
  const pool = real.length ? real : phases;
  const open = pool.filter(p => !PHASE_TERMINAL.has(p.status));
  const current = open.length ? open[open.length - 1] : null;
  const latest = pool.length ? pool[pool.length - 1] : null;

  const live = parseLiveRows(readIf('.union-stack/feature/live.md'));
  const handoffTxt = readIf(HANDOFF_PATH);
  const byStatus = st => wos.filter(w => !w.malformed && w.status === st);
  return {
    phases, current, latest, live,
    plans: index.filter(d => d.domain === 'PLAN'),
    now: byStatus('Active'), next: byStatus('Draft'), verifying: byStatus('Verifying'),
    shipped: (time.adrs || []).slice(-6).reverse(),
    locked: index.filter(d => LOCKED.has(d.status)),
    entry: handoffPart(handoffTxt, 'next'),
    cautions: handoffPart(handoffTxt, 'open'),
    debts: (health.dims || []).filter(d => d.status === 'FAIL' || d.status === 'WARN'),
    archived: (sprint && sprint.archived) || 0,
  };
}

/**
 * 제품 축 **전용 페이지**(순수). 다섯 번째 축 — 관객이 하네스 관리자가 아니라 PO 다.
 * 새 데이터를 만들지 않는다: PHASE·WO·원장·live·HANDOFF 를 PO 의 질문 순서로 다시 배열할 뿐이다.
 */
function productView(product, today) {
  if (!product) return '';
  const { phases, current, latest, live, plans, now, next, verifying, shipped, locked, entry, cautions, debts, archived } = product;
  const doneOf = p => p.exits.filter(e => e.done).length;
  const totalExits = phases.reduce((n, p) => n + p.exits.length, 0);
  const doneExits = phases.reduce((n, p) => n + doneOf(p), 0);
  const realLive = live.filter(r => !r.example);
  const woRow = w =>
    `<div class="crow"><span class="nm">[WO-${esc(w.id)}]</span>`
    + `<span class="fvals t">${prose(w.title || '')}</span>`
    + `${w.parent ? `<span class="note">← ${esc(w.parent)}</span>` : ''}</div>`;
  const board = (label, cls, items, empty) => `<section class="card"><h2>${label}</h2>
  <div class="meta">${items.length}건</div>
  ${items.length ? items.map(woRow).join('') : `<div class="meta">${empty}</div>`}</section>`;

  const phaseCard = p => {
    const done = doneOf(p), total = p.exits.length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const term = PHASE_TERMINAL.has(p.status);
    return `<div class="frow${p.example ? ' dim' : ''}"><span class="flabel">${esc(p.key)}</span>
    <span class="fvals t"><b>${prose(p.title)}</b>
      <span class="pill ${term ? 'fresh' : 'aging'}">status<b>${esc(p.status || '미기입')}</b></span>
      ${p === current ? '<span class="pill">현재<b>진행 중</b></span>' : ''}
      <div class="brow"><span class="bnm">exit</span>
        <span class="bbar"><span class="bfill" style="width:${pct}%"></span></span>
        <span class="bval">${total ? `${done}/${total}` : '기준 없음'}</span></div>
      ${p.exits.map(e => `<div class="note">${e.done ? '✓' : '·'} ${prose(e.text)}</div>`).join('')}
    </span></div>`;
  };
  const shipRow = a =>
    `<div class="crow"><span class="nm">${esc(a.id)}</span><span class="note">${esc(a.date)}</span>`
    + `<span class="fvals t">${prose(gistOf(a.text, 80))}</span></div>`;
  const liveRow = r =>
    `<div class="crow${r.example ? ' dim' : ''}"><span class="nm">${prose(r.feature)}</span>`
    + `<span class="note">${prose(r.ref)}</span><span class="fvals t">${prose(r.status)}</span></div>`;
  const planCounts = {};
  plans.forEach(d => { planCounts[d.status || '(없음)'] = (planCounts[d.status || '(없음)'] || 0) + 1; });

  return `<div class="tiles">
  <div class="tile"><div class="tl">현재 단계</div><div class="tv">${esc(current ? current.key : latest ? latest.key : '없음')}</div><div class="ts">${esc(current ? (current.status || '미기입') : latest ? `${latest.status} — 후속 단계 미정` : 'PHASE 문서 없음')}</div></div>
  <div class="tile"><div class="tl">로드맵 진행</div><div class="tv">${totalExits ? `${doneExits}/${totalExits}` : '—'}</div><div class="ts">exit 기준 충족(관측)</div></div>
  <div class="tile"><div class="tl">진행 중</div><div class="tv ${now.length ? 'good' : ''}">${now.length}</div><div class="ts">다음 ${next.length} · 검증 대기 ${verifying.length}</div></div>
  <div class="tile"><div class="tl">배송</div><div class="tv">${realLive.length}</div><div class="ts">live 표면 · 아카이브 WO ${archived}</div></div>
  </div>
  <section class="card"><h2>지금 무엇을 하는가 — 단일 진입점</h2>
  <div class="meta">HANDOFF §3 이 정본이다. 이 축은 그것을 로드맵·작업·배송과 나란히 놓을 뿐이다.</div>
  ${entry ? `<div class="fvals t">${prose(entry)}</div>` : '<div class="meta bad">HANDOFF §3 비어 있음 — 다음 세션이 진입점을 못 찾는다</div>'}</section>
  <section class="card" id="roadmap"><h2>로드맵 진행률 — PHASE exit 기준</h2>
  <div class="meta">exit 충족은 <b>산문에서 읽은 관측</b>이다(✅ 표식) — 판정이 아니다.
  기준이 0인 단계는 "달성"이 아니라 <b>기준이 없다</b>는 사실이다.</div>
  ${phases.length ? phases.map(phaseCard).join('') : '<div class="meta">PHASE 문서 없음 — roadmap 축이 비어 있다</div>'}</section>
  <div class="grid">
  ${board('Now — 진행 중', 'good', now, '없음 — 활성 WO 가 0이다')}
  ${board('Next — 대기', '', next, '없음 — 다음 작업이 문서화되지 않았다')}
  </div>
  <div class="grid">
  ${board('검증 대기 🔒 — Verifying(잠금)', 'warn', verifying, '없음')}
  <section class="card"><h2>PLAN 상태 롤업</h2>
  <div class="meta">${plans.length} PLAN</div>
  ${plans.length
    ? `<div class="pills">${Object.entries(planCounts).map(([k, v]) => `<span class="pill">${esc(k)}<b>${v}</b></span>`).join('')}</div>`
      + plans.map(d => `<div class="crow"><span class="nm">PLAN-${esc(d.id)}</span><span class="note">${esc(d.status || '(없음)')}</span><span class="fvals t">${esc(d.slug)}</span></div>`).join('')
    : '<div class="meta">PLAN 문서 없음</div>'}</section>
  </div>
  <div class="grid">
  <section class="card"><h2>최근 배송</h2>
  <div class="meta">원장 최근 ${shipped.length}건 · live 표면 ${live.length}행</div>
  ${shipped.map(shipRow).join('') || '<div class="meta">원장 항목 없음</div>'}
  ${live.length ? '<div class="meta">live 표면</div>' + live.map(liveRow).join('') : '<div class="meta">live.md 행 없음</div>'}</section>
  <section class="card"><h2>리스크</h2>
  <div class="meta">잠금 ${locked.length} · 게이트 부채 ${debts.length}</div>
  ${locked.length ? locked.map(d => `<div class="crow"><span class="nm">\u{1F512} ${esc(d.domain)}-${esc(d.id)}</span><span class="fvals t">${esc(d.slug)} — Verifying(다른 작업이 소유)</span></div>`).join('') : ''}
  ${debts.map(d => `<div class="crow"><span class="nm ${d.status === 'FAIL' ? 'bad' : ''}">${esc(d.name)}</span><span class="fvals t">${esc(d.value)}${d.note ? ' — ' + esc(d.note) : ''}</span></div>`).join('') || '<div class="meta">게이트 부채 없음</div>'}
  ${cautions ? `<div class="frow"><span class="flabel">HANDOFF §4</span><span class="fvals t">${prose(cautions)}</span></div>` : ''}</section>
  </div>`;
}

/**
 * 시간축 수집 — 원장(전술 결정) + HISTORY(전략 분기점) + LSN(오답노트) + 재제안 차단.
 * 파서는 각 소유 도구의 export 소비: parseLedger([TOOL-22] 관할)·parseHistory(history-linter)·
 * gatherBlocks([TOOL-22])·LSN frontmatter 는 work-close 의 순수 헬퍼(frontmatter/field)로 읽는다.
 */
function gatherTime(root) {
  const readIf = rel => { try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return ''; } };
  const adrs = parseLedger(readLedger(root));   // 머리 + 회전본([PRO-18] §3-3)
  const history = parseHistory(readIf('.union-stack/project/HISTORY.md'));
  const lessons = [];
  walkFiles(root, '.union-stack/reference/lessons', rel => {
    if (!rel.endsWith('.md') || rel.endsWith('_GUIDE.md')) return;
    const fm = frontmatter(readIf(rel));
    if (fm == null) { lessons.push({ file: rel, malformed: true }); return; }
    lessons.push({
      file: rel, id: field(fm, 'id'), title: field(fm, 'title'), status: field(fm, 'status'),
      occurrences: field(fm, 'occurrences'), valid_reason: field(fm, 'valid_reason'),
    });
  });
  return { adrs, history, lessons, blocks: gatherBlocks(root) };
}

/**
 * 시간축 **전용 페이지**(순수). 격자 §3.2가 식별한 **두 번째 빈칸**이 이 축이다 —
 * "같은 실수의 반복"은 여러 스프린트에 걸쳐서만 보이고 어느 단일 스냅샷에도 나타나지 않는다.
 * E1 실측이 근거를 보탠다: 하네스 페이오프가 가장 큰 구간이 정확히 비국소 지식(과거 실패·폐기
 * 결정)이었고, 그래서 [ADR-04]가 시간축 평면의 제거를 금지했다. 세 층을 편다:
 *   LSN(사전 경고 — 진입 의례가 선주입) · 원장(전술 결정 + 재제안 차단) · HISTORY(전략 분기점).
 */
function timeView(time, today) {
  if (!time) return '';
  const { adrs, history, lessons, blocks } = time;
  const realHistory = history.filter(e => !e.example);
  const blockIds = new Set(blocks.map(b => b.id));
  const byDate = {};
  for (const a of adrs) byDate[a.date] = (byDate[a.date] || 0) + 1;
  const dates = Object.keys(byDate).sort();
  const maxN = Math.max(1, ...Object.values(byDate));
  const densityRows = dates.map(d =>
    `<div class="brow"><span class="bnm">${esc(d)}</span>`
    + `<span class="bbar"><span class="bfill" style="width:${Math.round((byDate[d] / maxN) * 100)}%"></span></span>`
    + `<span class="bval">${byDate[d]}</span></div>`).join('');
  const gist = t => gistOf(t, 72);
  const recent = adrs.slice(-8).reverse().map(a =>
    `<div class="crow"><span class="nm">${esc(a.id)}</span><span class="note">${esc(a.date)}</span>`
    + `${blockIds.has(a.id) ? '<span class="pill dead">⛔<b>재제안 차단</b></span>' : ''}`
    + `<span class="fvals t" title="${esc(a.text.slice(0, 300))}">${prose(gist(a.text))}</span></div>`).join('');
  const blockRows = blocks.map(b =>
    `<div class="frow"><span class="flabel">⛔ ${esc(b.id)}</span><span class="fvals t"><b>${prose(b.blocks)}</b>`
    + `${b.reopen_when ? `<br><span class="note">재개 조건: ${prose(b.reopen_when)}</span>` : ''}</span></div>`).join('');
  const lsnCards = lessons.map(l => l.malformed
    ? `<div class="crow"><span class="nm">${esc(l.file.split('/').pop())}</span><span class="bad">frontmatter 없음</span></div>`
    : `<div class="frow"><span class="flabel">${esc(l.id || '?')}</span><span class="fvals t">${prose(l.title || '')}`
      + `${l.occurrences ? ` <span class="pill aging">반복<b>${esc(l.occurrences)}회</b></span>` : ''}`
      + `${l.valid_reason ? `<br><span class="note">유효 사유: ${prose(l.valid_reason)}</span>` : ''}</span></div>`).join('');
  // 근거 없는 행은 **빈 칸이 아니라 표식**으로 낸다 — 헤딩형 이관본에서 파서가 근거 절을 못 찾은
  // 경우가 여기로 온다(history-linter 의 CLARIFY 와 같은 사실). "왜: " 뒤의 공백은 아무 말도 안 한다.
  const histRows = history.map(e =>
    `<div class="frow${e.example ? ' dim' : ''}"><span class="flabel">${esc(e.date)}</span>`
    + `<span class="fvals t"><b>${prose(e.fact)}</b>`
    + `${e.form === 'heading' ? ' <span class="pill">형식<b>헤딩</b></span>' : ''}`
    + `<br>${e.reason
      ? `<span class="note">왜: ${prose(e.reason)}</span>`
      : '<span class="pill aging">근거<b>미검출 — CLARIFY</b></span>'}`
    + `${e.note ? `<br><span class="note">시사점: ${prose(e.note)}</span>` : ''}</span></div>`).join('');
  return `<div class="tiles">
  <div class="tile"><div class="tl">전술 결정</div><div class="tv">${adrs.length}</div><div class="ts">archive_ledger ADR</div></div>
  <div class="tile"><div class="tl">전략 분기점</div><div class="tv">${realHistory.length}</div><div class="ts">HISTORY (예시 ${history.length - realHistory.length} 별도)</div></div>
  <div class="tile"><div class="tl">오답노트</div><div class="tv">${lessons.length}</div><div class="ts">LSN — 진입 의례가 선주입</div></div>
  <div class="tile"><div class="tl">재제안 차단</div><div class="tv ${blocks.length ? 'warn' : ''}">${blocks.length}</div><div class="ts">blocks-index → AGENTS.md</div></div>
  </div>
  <section class="card"><h2>왜 이 페이지가 있는가</h2>
  <div class="meta">시간축은 격자가 식별한 <b>두 번째 빈칸</b>이다 — "같은 실수의 반복"은 여러 스프린트에
  걸쳐서만 보이고 어느 단일 스냅샷에도 나타나지 않는다. E1 실측: 하네스 페이오프가 가장 큰 구간이
  정확히 <b>비국소 지식</b>(과거 실패·폐기 결정)이었고, 그래서 [ADR-04]가 이 평면의 제거를 금지했다.
  세 층이다: <b>LSN</b>(사전 경고 — 진입 의례가 선주입) · <b>원장</b>(전술 결정 + 재제안 차단) ·
  <b>HISTORY</b>(전략 분기점 — 사실+근거 한 쌍).</div></section>
  <div class="grid">
  <section class="card"><h2>결정 밀도 — 날짜별 ADR</h2>
  <div class="meta">${adrs.length} 결정 / ${dates.length} 일</div>
  ${densityRows}</section>
  <section class="card"><h2>재제안 차단 — [PRO-14]</h2>
  <div class="meta">결정된 것을 다시 꺼내지 마라 — 재개 조건이 충족됐다면 그 근거를 먼저 제시하라</div>
  ${blockRows || '<div class="meta">차단 항목 없음</div>'}</section>
  </div>
  <section class="card"><h2>최근 결정 — 원장 끝 8건</h2>
  ${recent}</section>
  <div class="grid">
  <section class="card"><h2>오답노트 — LSN</h2>
  <div class="meta">같은 계보 2~3회 반복 실패만 등재([ADR-11] — 환경 사실은 사적 메모리로)</div>
  ${lsnCards || '<div class="meta">등재 없음</div>'}</section>
  <section class="card"><h2>전략 분기점 — HISTORY</h2>
  <div class="meta">사실+근거 한 쌍 — 금지가 아니라 경고. 근거가 회귀 판단의 핵심이다</div>
  ${histRows || '<div class="meta">등재 없음</div>'}</section>
  </div>`;
}

/** 개요용 당위 요약 카드(순수) — 등급·드리프트·concern 만 압축. 세부는 arch 페이지로 링크한다. */
function normCard(norms, sync, concerns) {
  if (!norms || !norms.total) return '';
  const GRADE = {
    gated: { cls: 'fresh', label: '게이트' },
    cited: { cls: 'aging', label: '인용만' },
    isolated: { cls: 'dead', label: '고립' },
  };
  const rows = norms.norms.map(n => {
    const g = GRADE[n.grade] || GRADE.isolated;
    const who = n.gates.length ? n.gates.map(f => f.split('/').pop()).join(' ') : `코드 ${n.codeCites} · 평면 ${n.planeCites}`;
    return `<div class="crow"><span class="nm" title="${esc(n.file)}">${esc(n.key)}</span>`
      + `<span class="pill ${g.cls}"><b>${g.label}</b></span><span class="note">${esc(who)}</span></div>`;
  }).join('');
  const drift = sync ? sync.planes.filter(p => ['gap', 'state'].includes(p.name)) : [];
  const verified = drift.filter(p => p.last).length;
  const driftLine = drift.map(p =>
    `<span class="pill ${p.last ? 'fresh' : 'dead'}">${esc(p.name)}<b>${esc(p.last || '무기입')}</b></span>`).join('');
  const tags = concerns && concerns.tagged
    ? Object.entries(concerns.byTag).map(([t, n]) => `<span class="pill fresh">${esc(t)}<b>${n}</b></span>`).join('')
    : `<span class="pill dead">concern 태그<b>사용 0</b></span>`;
  return `<section class="card" id="norm"><h2>당위 축 — 규범과 그 집행
    <label class="more" data-nav="arch" for="v-arch">자세히 →</label></h2>
  <div class="meta">규범 ${norms.total} · 게이트 ${norms.gated} · 인용만 ${norms.cited}`
    + `${norms.isolated ? ` · <span class="bad">고립 ${norms.isolated}</span>` : ''}`
    + `${verified === 0 ? ` · <span class="bad">대조된 적 없음</span>` : ''}</div>
  ${rows}
  <div class="pills">${driftLine}${tags}</div></section>`;
}

/**
 * 당위 축(ARCH) **전용 페이지**(순수). 개요의 요약 카드가 아니라 세부 뷰다.
 *
 * 이 축의 짝은 verification 의 첫 화살표(규범↔현실=gap)이므로, 목록이 아니라
 * "규범이 무엇을 말하고, 지켜지는지 누가 보는가"를 낸다. 규범마다 넷을 편다:
 *   제목·티어·크기 · **절 구조**(파일을 열지 않고 내용을 가늠) ·
 *   **집행자의 계약**(특히 `scope` — [PRO-11]의 존재 이유가 "무엇을 *안* 보는지가 호출부에서
 *   읽혀야 한다"이고 규범 페이지가 그 호출부다) · **인용처 목록**(계수를 이동 가능한 정보로).
 *
 * ⚠ **인용 ≠ 집행.** 문자열 언급 기반 추정이라 판정이 아니라 관측이다([ADR-07] 계측 오염 함정).
 */
function normView(norms, sync, concerns) {
  if (!norms || !norms.total) {
    return `<section class="card"><h2>당위 축 — 규범과 그 집행</h2>
  <div class="meta">규범 문서(ARCH·INF) 없음 — 이 축은 아직 비어 있다</div></section>`;
  }
  const GRADE = {
    gated: { cls: 'fresh', label: '게이트 있음', why: '판정 계약을 선언한 실행 자산이 이 규범을 참조한다' },
    cited: { cls: 'aging', label: '인용만', why: '아는 곳은 있으나 아무것도 판정하지 않는다 — 산문 규범' },
    isolated: { cls: 'dead', label: '고립', why: '평면·코드 어디서도 인용하지 않는다 — 죽은 규범' },
  };
  const fileList = (label, files) => files.length
    ? `<div class="frow"><span class="flabel">${label}</span><span class="fvals">`
      + files.map(f => `<code title="${esc(f)}">${esc(f.split('/').pop())}</code>`).join('') + '</span></div>'
    : '';
  const contractBlock = c => `<div class="ctr">
    <div class="ctrh">${esc(c.gate || c.file)}</div>
    ${c.predicate ? `<div class="frow"><span class="flabel">판정</span><span class="fvals t">${esc(c.predicate)}</span></div>` : ''}
    ${c.scope ? `<div class="frow"><span class="flabel scope">사각지대</span><span class="fvals t">${esc(c.scope)}</span></div>` : ''}
    ${c.outcomes && c.outcomes.length ? `<div class="frow"><span class="flabel">결과</span><span class="fvals">${c.outcomes.map(o => `<code>${esc(o)}</code>`).join('')}</span></div>` : ''}
    ${c.failure_mode ? `<div class="frow"><span class="flabel">실패 시</span><span class="fvals t">${esc(c.failure_mode)}</span></div>` : ''}
  </div>`;
  const card = n => {
    const g = GRADE[n.grade] || GRADE.isolated;
    return `<section class="card norm">
    <h2>${esc(n.key)} <span class="ntitle">${esc(n.title || '')}</span></h2>
    <div class="meta"><span class="pill ${g.cls}"><b>${g.label}</b></span>
      <span class="note">${esc(g.why)}</span></div>
    <div class="meta"><span class="note">${esc(n.file)} · ${n.kb}KB · status ${esc(n.status || '없음')} · tier ${esc(n.tier || '미기입')}</span></div>
    ${n.headings.length ? `<div class="frow"><span class="flabel">절 구조</span><span class="fvals">${n.headings.map(h => `<code>${esc(h)}</code>`).join('')}</span></div>` : ''}
    ${n.gateContracts.length ? n.gateContracts.map(contractBlock).join('')
      : `<div class="frow"><span class="flabel">집행</span><span class="fvals t">판정하는 게이트 없음</span></div>`}
    ${fileList('코드 인용', n.cites)}
    ${fileList('평면 인용', n.planeFiles)}
  </section>`;
  };
  // 드리프트 화살표: gap·state 가 무기입이면 규범이 현실과 대조된 적이 **없다**.
  const drift = sync ? sync.planes.filter(p => ['gap', 'state'].includes(p.name)) : [];
  const verified = drift.filter(p => p.last).length;
  const driftPills = drift.map(p =>
    `<span class="pill ${p.last ? 'fresh' : 'dead'}">${esc(p.name)}<b>${esc(p.last || '무기입')}</b></span>`).join('');
  const tags = concerns && concerns.tagged
    ? Object.entries(concerns.byTag).map(([t, n]) => `<span class="pill fresh">${esc(t)}<b>${n}</b></span>`).join('')
    : `<span class="pill dead">concern 태그<b>사용 0</b></span>`;
  return `<div class="tiles">
  <div class="tile"><div class="tl">규범</div><div class="tv">${norms.total}</div><div class="ts">ARCH + INF</div></div>
  <div class="tile"><div class="tl">게이트 있음</div><div class="tv ${norms.gated ? 'good' : 'bad'}">${norms.gated}</div><div class="ts">판정 계약이 참조</div></div>
  <div class="tile"><div class="tl">산문뿐</div><div class="tv ${norms.cited ? 'warn' : ''}">${norms.cited}</div><div class="ts">인용만 · 판정 없음</div></div>
  <div class="tile"><div class="tl">현실과 대조</div><div class="tv ${verified ? 'good' : 'bad'}">${verified}/${drift.length || 0}</div><div class="ts">verification 첫 화살표</div></div>
  </div>
  <section class="card"><h2>왜 이 절이 있는가</h2>
  <div class="meta">이 축의 짝은 <b>verification 의 첫 화살표(규범↔현실 = gap)</b>다. 그래서 나열이 아니라
  "지켜지는지 누가 보는가"를 낸다 — 나열은 계보 뷰가 이미 한다.
  근거는 이 레포 자신의 데이터다: <b>[PHASE-02] E3 가 의례 자발 수행률 0%를 실측</b>해 산문 규칙만으론
  강제되지 않음을 확증했다. <span class="bad">단 인용은 집행이 아니다</span> — 아래 등급은 문자열 언급
  기반 추정이므로 판정이 아니라 관측이다([ADR-07] 계측 오염 함정).</div></section>
  ${norms.norms.map(card).join('\n')}
  <section class="card"><h2>규범 ↔ 현실 검증 <span class="note">verification 첫 화살표</span></h2>
  <div class="meta">${verified === 0
    ? `<span class="bad">규범 ${norms.total}건 중 0건이 현실과 대조된 적 없다</span> — gap·state 가 무기입이다`
    : `대조 기록 있음`}</div>
  <div class="pills">${driftPills}</div></section>
  <section class="card"><h2>횡단 오버레이 <span class="note">[PRO-04] concern:</span></h2>
  <div class="meta">${concerns && concerns.tagged
    ? `${concerns.tagged}/${concerns.total} 문서에 태그됨`
    : `<span class="bad">승인됐으나 사용 0</span> — 관측이 없으면 폐기 판단도 못 한다(consumers: 와 같은 문법)`}</div>
  <div class="pills">${tags}</div></section>`;
}

/** health.gather() effect surface 절의 byTool → 도구별 막대(순수). 한 줄 텍스트를 스캔 가능하게. */
function effectSection(dim) {
  if (!dim || !dim.note) return '';
  const pairs = dim.note.split('←')[0].trim().split(/\s+/)
    .map(t => { const i = t.lastIndexOf(':'); return i > 0 ? { tool: t.slice(0, i), n: +t.slice(i + 1) } : null; })
    .filter(p => p && Number.isFinite(p.n));
  if (!pairs.length) return '';
  const max = Math.max(...pairs.map(p => p.n));
  const bars = pairs.map(p => `<div class="brow"><span class="bnm">${esc(p.tool)}</span>`
    + `<span class="bbar"><span class="bfill" style="width:${Math.round((p.n / max) * 100)}%"></span></span>`
    + `<span class="bval">${p.n}</span></div>`).join('\n');
  return `<section class="card" id="effect"><h2>효과 표면 — 도구별 allow 규칙</h2>
  <div class="meta">${esc(dim.value)}</div>
  ${bars}</section>`;
}

/** work-close.gather() 결과 → 활성 작업대(순수). 활성 판정은 export 된 ACTIVE 소비. */
function worktableSection(wos) {
  const act = wos.filter(w => !w.malformed && ACTIVE.has(w.status));
  const bad = wos.filter(w => w.malformed);
  if (!act.length && !bad.length) {
    return `<section class="card" id="wo"><h2>작업대 — 활성 WO<label class="more" data-nav="sprint" for="v-sprint">자세히 →</label></h2><div class="meta">활성 WO 없음</div></section>`;
  }
  const tr = w => `<tr><td class="nm">[WO-${w.id}]</td><td>${esc(w.title || '')}</td>`
    + `<td>${esc(w.parent || '')}</td><td>${esc(w.status || '')}</td><td class="note">${esc(w.evidence || '')}</td></tr>`;
  const warn = bad.length
    ? `<div class="meta bad">frontmatter 없는 WO ${bad.length}건: ${bad.map(w => esc(w.file)).join(' ')}</div>` : '';
  return `<section class="card" id="wo"><h2>작업대 — 활성 WO<label class="more" data-nav="sprint" for="v-sprint">자세히 →</label></h2>${warn}
  <table class="tbl"><tr class="th"><td>WO</td><td>제목</td><td>부모</td><td>상태</td><td>증거</td></tr>
  ${act.map(tr).join('\n')}</table></section>`;
}

// SaaS 카드 레이아웃 — 회색 캔버스 위 흰 카드, 스탯 타일 행, 2열 그리드(좁으면 1열).
// 크롬(네비·타일·카드 제목)은 산세리프, 데이터(ID·값·평면)는 PLANE_CSS 의 모노스페이스 유지.
const DASH_CSS = `
  body { background:#f6f7f9; font:13px/1.5 -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif; }
  main { max-width:1200px; margin:0 auto; padding:20px 24px 48px; }
  nav { position:sticky; top:0; background:rgba(255,255,255,.92); backdrop-filter:blur(4px);
        border-bottom:1px solid var(--line); padding:12px 24px; display:flex; gap:18px;
        align-items:baseline; z-index:2; }
  nav b { font-size:14px; margin-right:auto; }
  nav label { color:var(--muted); font-size:12.5px; padding:4px 10px;
              border-radius:6px; cursor:pointer; user-select:none; }
  nav label:hover { color:var(--ink); background:#f1f2f4; }
  .more { margin-left:auto; font-size:11.5px; font-weight:400; color:#2a78d6;
          text-decoration:none; cursor:pointer; user-select:none; }
  .more:hover { text-decoration:underline; }
  .card > h2 { display:flex; align-items:baseline; gap:10px; }
  .card.norm > h2 { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap;
                    font-family:ui-monospace, Consolas, monospace; }
  .ntitle { font-family:-apple-system,"Segoe UI",Roboto,"Noto Sans KR",sans-serif;
            font-weight:400; color:var(--muted); font-size:12.5px; }
  .frow { display:flex; gap:10px; margin:8px 18px 0; align-items:baseline; font-size:12.5px; }
  .flabel { flex:0 0 74px; color:var(--faint); font-size:11.5px; }
  .flabel.scope { color:#b54708; font-weight:600; }
  .fvals { display:flex; flex-wrap:wrap; gap:5px; min-width:0; }
  .fvals.t { display:block; color:var(--ink); line-height:1.5; }
  .fvals code { background:#f1f2f4; border-radius:4px; padding:1px 6px; font-size:11.5px;
                font-family:ui-monospace, Consolas, monospace; }
  .ctr { margin:10px 18px 0; padding:10px 12px; border:1px solid var(--line);
         border-radius:8px; background:#fafbfc; }
  .ctr .frow { margin:6px 0 0; }
  .ctrh { font-size:12px; font-weight:600; font-family:ui-monospace, Consolas, monospace; }
  .frow.dim { opacity:.55; }
  .tiles { display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:14px;
           margin-bottom:14px; }
  .tile { background:#fff; border:1px solid var(--line); border-radius:10px;
          box-shadow:0 1px 2px rgba(16,24,40,.05); padding:14px 16px; }
  .tl { font-size:12px; color:var(--muted); }
  .tv { font-size:24px; font-weight:650; margin:2px 0;
        font-family:ui-monospace, Consolas, monospace; font-variant-numeric:tabular-nums; }
  .tv.good { color:#067647; } .tv.bad { color:#b42318; } .tv.warn { color:#b54708; }
  .ts { font-size:11.5px; color:var(--faint); }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; align-items:start; }
  .col { display:grid; gap:14px; }
  @media (max-width: 920px) { .grid { grid-template-columns:1fr; } }
  .card { background:#fff; border:1px solid var(--line); border-radius:10px;
          box-shadow:0 1px 2px rgba(16,24,40,.05); padding:0; margin-top:14px; }
  .grid .card, .col .card { margin-top:0; }
  .card > h2 { font-size:13px; font-weight:600; color:var(--ink); letter-spacing:0;
               text-transform:none; margin:0; padding:12px 18px; border-bottom:1px solid var(--line); }
  .card > .meta, .card > .tbl, .card > .brow { margin-left:18px; margin-right:18px; }
  .card > .meta { margin-top:10px; }
  .card > :last-child { margin-bottom:14px; }
  .tbl { border-collapse:collapse; font-size:12.5px; margin-top:8px; }
  .tbl td { padding:4px 16px 4px 0; vertical-align:baseline; border-top:1px solid #f1f2f4; }
  .tbl tr:first-child td { border-top:0; }
  .tbl .th td { color:var(--faint); font-size:11px; }
  .mk { white-space:nowrap; font-weight:600; font-size:11.5px; }
  .nm { font-weight:600; white-space:nowrap; font-family:ui-monospace, Consolas, monospace; }
  .note { color:var(--faint); }
  .ok { color:#067647; font-weight:600; }
  .bad { color:#b42318; font-weight:600; }
  .brow { display:flex; align-items:center; gap:10px; padding:3px 0; font-size:12.5px; }
  .bnm { min-width:70px; }
  .bbar { flex:1; max-width:260px; height:8px; background:var(--line); border-radius:4px; overflow:hidden; }
  .bfill { display:block; height:100%; background:#2a78d6; }
  .bover { background:#b42318; }
  .bnear { background:#b54708; }
  .bval { color:var(--muted); font-family:ui-monospace, Consolas, monospace; }
  .bnm.sz { min-width:0; flex:0 0 210px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
            font-family:ui-monospace, Consolas, monospace; font-size:11.5px; }
  .pills { display:flex; flex-wrap:wrap; gap:8px; margin:10px 18px 0; }
  .pills.inline { margin:0; }
  .crow { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin:8px 18px 0; }
  .carrow { color:var(--faint); }
  .pill { display:inline-flex; align-items:baseline; gap:6px; padding:4px 10px; border-radius:999px;
          border:1px solid var(--line); background:#fafbfc; font-size:11.5px; color:var(--muted); }
  .pill b { font-family:ui-monospace, Consolas, monospace; color:var(--ink); }
  .pill.fresh { border-color:#a6e0c1; background:#f0fbf5; } .pill.fresh b { color:#067647; }
  .pill.aging { border-color:#f0d08a; background:#fffaf0; } .pill.aging b { color:#b54708; }
  .pill.stale, .pill.dead { border-color:#f1bcb7; background:#fef6f5; } .pill.stale b, .pill.dead b { color:#b42318; }
  /* 인용 산문(prose()) — 행두 '>' 였던 줄. 마커를 지우는 대신 들여쓰기+세로선으로 옮긴다. */
  .fvals .q { display:inline-block; border-left:3px solid var(--line); padding-left:8px; color:#4b5563; }
  .fvals code { font:12px/1.4 ui-monospace, Consolas, monospace; background:#f3f4f6; border-radius:3px; padding:0 4px; }
  .card .plane { font:12.5px/1.45 ui-monospace, Consolas, monospace; }
  .card .plane section { padding:10px 18px; }
  .card .plane > .meta, .card .plane > .legend, .card .plane > .flt { margin:8px 18px 0; }
`;

/**
 * 뷰 정의 — 축 하나가 페이지 하나다. 새 축을 추가하려면 여기에 한 줄을 더한다.
 * 라우팅은 해시(`#/arch`)로 한다: 사용자에겐 고유 URL·뒤로가기·북마크가 있는 **별도 페이지**이면서,
 * 산출물은 zero-dep 자기완결 **1개 파일**로 남는다(gitignore 항목·링크 관리가 늘지 않는다).
 * 파일 분리로 바꾸려면 이 배열을 파일별로 렌더하고 href 만 바꾸면 된다 — 뷰 함수는 그대로다.
 */
const VIEWS = [
  { id: 'overview', label: '개요' },
  { id: 'product', label: '제품' },
  { id: 'arch', label: '당위(ARCH)' },
  { id: 'sprint', label: '스프린트' },
  { id: 'time', label: '시간축' },
];

/**
 * 어답터 섹션 로드 — `--sections <path>` ([이슈 #4] 컴포지션 확장점).
 *
 * 왜 필요한가: 이 파일은 **sync 카테고리**다. 어답터가 자기 관측(제품 KPI·도메인 지표)을 한 장에
 * 합치려면 지금까지 선택지가 ⓐ sync 파일 포크(→ 다음 --apply 가 덮어씀) ⓑ HTML 2장(합성 원칙
 * 훼손) 뿐이었다. 확장점 하나로 그 포크를 0으로 만든다 — 어답터 파일은 template-update 불간섭.
 *
 * 계약: 모듈이 `[{ id, title, axis, axisLabel?, render(gathered) }]`(또는 `{sections:[...]}`)를
 * export 한다. `render` 는 **수집된 데이터 → HTML 조각**의 순수 함수이고, 카드 껍데기(`<section>`·
 * 제목)는 호스트가 씌운다 — 어답터 섹션이 페이지 구조를 깨뜨릴 수 없게 하려는 것이다.
 * `axis` 가 기존 축 id 면 그 페이지에 덧붙고, 새 id 면 축(나브 항목 + 페이지)이 하나 생긴다.
 */
function loadSections(root, rel) {
  const abs = path.isAbsolute(rel) ? rel : path.resolve(root, rel);
  const mod = require(abs);
  const list = Array.isArray(mod) ? mod : (mod && Array.isArray(mod.sections) ? mod.sections : null);
  if (!list) throw new Error(`${rel}: 배열 또는 {sections:[...]} 를 export 해야 한다`);
  return list.map((sec, i) => ({
    id: sec.id || `local-${i + 1}`,
    title: sec.title || sec.id || `섹션 ${i + 1}`,
    axis: sec.axis || 'overview',
    axisLabel: sec.axisLabel,
    render: sec.render,
  }));
}

/** 어답터 섹션 1개 → 카드(순수). **실패한 섹션은 그 카드만 오류를 적는다** — 페이지 전체는 산다. */
function renderSection(sec, data) {
  let inner;
  try {
    if (typeof sec.render !== 'function') throw new Error('render 가 함수가 아니다');
    inner = String(sec.render(data) ?? '');
  } catch (e) {
    inner = `<div class="meta bad">섹션 렌더 실패 — ${esc(e && e.message ? e.message : String(e))}</div>`;
  }
  return `<section class="card" id="${esc(sec.id)}"><h2>${esc(sec.title)}</h2>\n${inner}</section>`;
}

/** 기본 축 + 어답터 섹션이 요구한 새 축(순수). 기존 축 순서는 불변 — 새 축만 뒤에 붙는다. */
function buildViews(sections = []) {
  const views = VIEWS.slice();
  for (const sec of sections) {
    if (views.some(v => v.id === sec.axis)) continue;
    views.push({ id: sec.axis, label: sec.axisLabel || sec.axis });
  }
  return views;
}

/** 수집된 표면 → 자기완결 HTML(순수 — FS 접근 없음). */
function render(data, { title = 'plane', sections = [] } = {}) {
  const views = buildViews(sections);
  const { index, health, budget, wos, today } = data;
  const effectDim = (health.dims || []).find(d => d.name === 'effect surface');
  const body = {
    overview: `${tilesSection(data)}
<div class="grid">
${healthSection(health)}
<div class="col">
${budgetSection(budget)}
${worktableSection(wos)}
${syncSection(health.sync, today)}
</div>
</div>
<div class="grid">
<div class="col">
${normCard(health.norms, health.sync, health.concerns)}
${sizeSection(health.sizes, health.sizeCapKb)}
</div>
<div class="col">
${contractSection(health.contracts)}
${effectSection(effectDim)}
</div>
</div>
<section class="card" id="plane"><h2>계보 — 평면 전체</h2>
<div class="plane">${planeBody(index)}</div>
</section>`,
    product: productView(data.product, today),
    arch: normView(health.norms, health.sync, health.concerns),
    sprint: sprintView(data.sprint, today),
    time: timeView(data.time, today),
  };
  for (const sec of sections) body[sec.axis] = `${body[sec.axis] || ''}\n${renderSection(sec, data)}`;
  // 라디오는 nav·main **앞**에 와야 한다(`~`는 뒤따르는 형제만 고른다). 첫 뷰가 checked.
  return `<!doctype html>
<meta charset="utf-8">
<title>dashboard — ${esc(title)}</title>
<style>${PLANE_CSS}${DASH_CSS}${routerCss(views)}</style>
${views.map((v, i) => `<input class="vsel" type="radio" name="v" id="v-${v.id}"${i ? '' : ' checked'}>`).join('\n')}
<nav><b>${esc(title)}</b>
  ${views.map(v => `<label for="v-${v.id}" data-nav="${v.id}">${esc(v.label)}</label>`).join('')}</nav>
<main>
${views.map(v => `<div class="view" data-view="${v.id}">\n${body[v.id] || ''}\n</div>`).join('\n')}
</main>
<script>${ROUTER_JS}${FILTER_JS}</script>
`;
}

// 뷰 라우터 — 축 하나 = 페이지 하나. **CSS가 정본이고 JS는 부가다.**
// 전환을 JS에 걸면 스크립트를 실행하지 않는 뷰어(파일 미리보기 패널)에서 첫 뷰에 갇혀 나머지 축에
// 영영 도달할 수 없다(실측 2회: 전 뷰 hidden → 빈 화면, 이어서 클릭 핸들러 → 전환 불가).
// 그래서 전환은 라디오 `:checked ~` 형제 선택자로 스크립트 0에서 성립시키고, JS는 해시 북마크만 얹는다.
// CSS까지 죽은 환경에서는 전 뷰가 세로로 쌓여 **내용은 여전히 읽힌다**(빈 화면으로 죽지 않는다).
const routerCss = views => `
  .vsel { position:absolute; width:1px; height:1px; opacity:0; pointer-events:none; }
  .view { display:none; }
${views.map(v => `  #v-${v.id}:checked ~ main .view[data-view="${v.id}"] { display:block; }
  #v-${v.id}:checked ~ nav label[for="v-${v.id}"] { color:#fff; background:#2a78d6; font-weight:600; }`).join('\n')}
`;

const ROUTER_JS = `
(function () {
  const sels = [...document.querySelectorAll('.vsel')];
  if (!sels.length) return;
  const idOf = el => el.id.slice(2);
  const fromHash = () => (location.hash || '').slice(0, 2) === '#/' ? location.hash.slice(2) : '';
  function pick(want) {
    const hit = sels.find(s => idOf(s) === want);
    if (hit) hit.checked = true;
  }
  sels.forEach(s => s.addEventListener('change', () => {
    if (!s.checked) return;
    try { history.replaceState(null, '', '#/' + idOf(s)); } catch (_) { /* data: URL 등 — 무시 */ }
    scrollTo(0, 0);
  }));
  addEventListener('hashchange', () => pick(fromHash()));
  pick(fromHash());
})();
`;

/** 표면 수집(read-only). `today`는 신선도 경과일 계산용 — 순수 렌더에 주입한다. */
function gatherAll(root = path.resolve(__dirname, '..'), today = new Date().toISOString().slice(0, 10)) {
  const wos = gatherWos(root);
  const data = {
    index: buildIndex(root), health: gatherHealth(root), budget: gatherBudget(root),
    wos, sprint: gatherSprint(root, wos), time: gatherTime(root), today,
  };
  data.product = gatherProduct(root, data);   // 파생만 한다 — 같은 수집을 두 번 하지 않는다
  return data;
}

module.exports = {
  tilesSection, healthSection, budgetSection, worktableSection,
  sizeSection, syncSection, effectSection, contractSection, normCard, normView,
  gatherSprint, sprintView, gatherTime, timeView,
  gatherProduct, productView, parseExitCriteria, parseLiveRows, PHASE_TERMINAL,
  esc, prose, proseInline, clip, gistOf, closeDanglingMarker,
  loadSections, renderSection, buildViews, routerCss,
  render, gatherAll, VIEWS, MARKS,
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const root = path.resolve(__dirname, '..');
  const data = gatherAll(root);
  if (args.includes('--json')) {
    console.log(JSON.stringify({ health: data.health, budget: data.budget, wos: data.wos }, null, 2));
    process.exit(data.health.fails ? 1 : 0);
  }
  const oi = args.indexOf('--out');
  const out = oi >= 0 && args[oi + 1] ? args[oi + 1] : path.join(root, 'dashboard.html');
  // 어답터 섹션은 **선택**이다. 로드 실패는 조용히 넘기지 않는다(경로 오타가 "내 섹션이 없네"로
  // 끝나는 것이 이 부류 확장점의 표준 사고) — 보고하고, 대시보드는 나머지로 계속 낸다.
  const si = args.indexOf('--sections');
  let sections = [], sectionsFailed = false;
  if (si >= 0 && args[si + 1]) {
    try { sections = loadSections(root, args[si + 1]); }
    catch (e) { sectionsFailed = true; console.error(`섹션 로드 실패: ${args[si + 1]} — ${e.message}`); }
  }
  fs.writeFileSync(out, render(data, { title: path.basename(root), sections }));
  console.error(`대시보드: docs ${data.index.length} · 게이트 FAIL ${data.health.fails} · 활성 WO ${data.wos.filter(w => ACTIVE.has(w.status)).length}`
    + `${sections.length ? ` · 어답터 섹션 ${sections.length}` : ''} → ${out}`);
  if (sectionsFailed) process.exit(1);
}
