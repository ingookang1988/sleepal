// scripts/adopt-map.js
// init --adopt 매핑안 — union-stack 이 없는 기존 프로젝트의 문서 트리를 **경로·파일명·헤딩 줄만** 읽어(본문 0)
// MIGRATION.md 매핑표를 채운 안(자리 · 제안 ZFS ID · 확신도)과 adapter.json 초안을 낸다([PRO-29] ③(a), [WO-29a-11]).
// dry-run 전용 — 대상 레포에 쓰지 않는다. 적용(git mv · 앵커)은 ③(b).
//
// 규칙의 정본은 MIGRATION.md 매핑표다: RULES 의 home 은 표의 둘째 열(첫 백틱 토큰)과 1:1 — adopt-map.test 가 대응을 강제한다(표와 코드가 갈라지지 않게).
// 확신도([PRO-29] §7-4, 인간 판정 2026-10-20): high = 디렉터리 + 헤딩 · medium = 그 밖의 신호(파일명+헤딩 포함) · low = 없음(매핑 안 함, 목록만).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// kind: id = `<dir>/<DOMAIN>-NN_slug.md` · file = 그 파일 하나에 합친다(사람이 옮겨 적는다) · dir = 그 디렉터리에 원래 이름으로.
// 순서 = 동점일 때의 우선순위(구체적인 것 먼저 — ADR·인프라 결정이 일반 계획보다, 로드맵이 계획보다 앞).
const RULES = [
  { home: '.union-stack/archive_ledger.md', label: 'ADR', kind: 'file', domain: null,
    path: /(^|\/)(adrs?|decisions?)(\/|$)/i, head: /^(status|context|decision|consequences)$|결정/i },
  { home: '.union-stack/architecture/infra/INF-*', label: '인프라 결정', kind: 'id', domain: 'INF', dir: '.union-stack/architecture/infra',
    path: /(^|\/)(infra|infrastructure|deploy(ment)?|ops|database)\b|\bdb\b/i, head: /deploy|database|infra|배포|인프라|데이터베이스/i },
  // 전략·전략 이니셔티브 포함(인간 승인 2026-10-20 — OSS 실측 nodejs/TSC 의 Strategic-Initiatives·OpenSSL-Strategy 가 자리 없음이었다).
  { home: '.union-stack/project/roadmap/PHASE-*', label: '로드맵', kind: 'id', domain: 'PHASE', dir: '.union-stack/project/roadmap',
    path: /roadmap|milestones?|strateg(y|ic|ies)/i, head: /roadmap|milestone|phase|strateg|initiative|로드맵|마일스톤|전략/i },
  { home: '.union-stack/project/HISTORY.md', label: '전략 분기점', kind: 'file', domain: null,
    path: /(^|\/)(history|pivots?)[^/]*\.md$/i, head: /pivot|why we changed|direction change|전략|방향 전환|분기점/i },
  { home: '.union-stack/architecture/ARCH-*', label: '아키텍처 규범', kind: 'id', domain: 'ARCH', dir: '.union-stack/architecture',
    path: /(^|\/)(architecture|arch|design)(\/|[-_.]|$)/i, head: /architecture|layer|dependenc|아키텍처|계층|의존/i },
  // 거버넌스·정책 = 과정의 규범(당위) — ARCH-00(네이밍 규범)이 선례(인간 승인 2026-10-20, OSS 실측 nodejs/TSC 의 Charter·CoC·Moderation-Policy 자리 공백).
  { home: '.union-stack/architecture/ARCH-*', label: '거버넌스·정책', kind: 'id', domain: 'ARCH', dir: '.union-stack/architecture',
    path: /governance|charter|polic(y|ies)|code[-_ ]?of[-_ ]?conduct|working[-_ ]?groups?|bylaws?/i,
    head: /charter|governance|\bpolicy\b|policies|code of conduct|moderation|working groups?|bylaws?|헌장|거버넌스|정책|행동 강령/i },
  { home: '.union-stack/plan/meetings/MTG-*', label: '회의록', kind: 'id', domain: 'MTG', dir: '.union-stack/plan/meetings',
    path: /(^|\/)(meetings?|minutes)(\/|[-_.]|$)/i, head: /meeting|attendees|agenda|minutes|회의|참석/i },
  { home: '.union-stack/reference/lessons/LSN-*', label: '교훈·포스트모템', kind: 'id', domain: 'LSN', dir: '.union-stack/reference/lessons',
    path: /(^|\/)(postmortems?|lessons?|incidents?|retros?|retrospectives?)(\/|[-_.]|$)/i, head: /postmortem|lesson|root cause|incident|교훈|원인|재발/i },
  { home: '.union-stack/reference/contracts/CON-*', label: '계약·인터페이스', kind: 'id', domain: 'CON', dir: '.union-stack/reference/contracts',
    path: /(^|\/)(api|contracts?|interfaces?|schemas?)(\/|[-_.]|$)|schema/i, head: /interface|contract|schema|\bapi\b|계약|인터페이스|스키마/i },
  { home: '.union-stack/reference/domain/DOM-*', label: '도메인 모델', kind: 'id', domain: 'DOM', dir: '.union-stack/reference/domain',
    path: /(^|\/)(domain|models?)(\/|[-_.]|$)|[-_]model\b/i, head: /domain|model|formula|theory|도메인|모델|공식/i },
  { home: '.union-stack/proposals/PRO-*', label: '규칙 변경 제안', kind: 'id', domain: 'PRO', dir: '.union-stack/proposals',
    path: /(^|\/)(proposals?|rfcs?)(\/|[-_.]|$)/i, head: /proposal|motivation|\brfc\b|제안/i },
  { home: '.union-stack/sprint/HANDOFF.md', label: '세션 인계', kind: 'file', domain: null,
    path: /handoff|session[-_]?log/i, head: /handoff|next session|인계/i },
  { home: '.union-stack/sprint/', label: '작업 오더', kind: 'id', domain: 'WO', dir: '.union-stack/sprint',
    path: /(^|\/)(sprints?|tasks?|todos?|backlog|work[-_]?orders?|tickets?)(\/|[-_.]|$)/i, head: /^task|todo|acceptance|objective|작업|수용 기준|완료 기준/i },
  { home: '.union-stack/plan/PLAN-*', label: '기능 계획·요구', kind: 'id', domain: 'PLAN', dir: '.union-stack/plan',
    path: /(^|\/)(plans?|requirements?|specs?|prds?)(\/|[-_.]|$)/i, head: /requirement|goals?\b|\bplan\b|intent|요구|계획|목표/i },
  { home: '.union-stack/feature/', label: '기능 지도·흐름', kind: 'id', domain: 'FLOW', dir: '.union-stack/feature/flow',
    path: /(^|\/)(features?|flows?|user[-_]?flows?|journeys?)(\/|[-_.]|$)/i, head: /\bflow\b|journey|shipped|흐름|여정/i },
  { home: '.union-stack/verification/', label: 'CI·검증 기록', kind: 'dir', domain: null, dir: '.union-stack/verification/raw',
    path: /(^|\/)(ci|test[-_]?results?|reports?|logs?|drift)(\/|[-_.]|$)/i, head: /test results?|coverage|ci run|drift|테스트 결과|리포트/i },
  { home: '.union-stack/spike/', label: '실험', kind: 'dir', domain: null, dir: '.union-stack/spike',
    path: /(^|\/)(spikes?|experiments?|poc|prototypes?|scratch)(\/|[-_.]|$)/i, head: /spike|experiment|proof of concept|실험|프로토타입/i },
  { home: '.union-stack/project/IDENTITY*.md', label: '정체성(README·비전)', kind: 'file', domain: null,
    // README 는 **레포 루트의 것만** 정체성이다(root) — OSS 실측(nodejs/TSC): votes/README.md 가 IDENTITY 로 갔다. vision·scope·glossary 는 어디서든.
    path: /(^|\/)(vision|scope|glossary)[^/]*\.md$/i, root: /^readme[^/]*\.md$/i, head: /overview|vision|scope|glossary|비전|범위|용어/i },
];

/** MIGRATION.md 매핑표 → 자리 목록(둘째 열의 첫 백틱 토큰, 순수). */
function migrationHomes(md) {
  const sec = String(md || '').split(/^## Mapping table/m)[1] || '';
  const body = sec.split(/^## /m)[0];
  const out = [];
  for (const line of body.split(/\r?\n/)) {
    const cols = line.split('|').map(c => c.trim());
    if (cols.length < 4 || /^-+$/.test(cols[1]) || /Your existing artifact/.test(cols[1])) continue;
    const m = cols[2].match(/`([^`]+)`/);
    if (m) out.push(m[1]);
  }
  return out;
}

/** 헤딩 줄만(순수) — 코드 펜스 안은 제외. 본문은 결과에 싣지 않는다. */
function headingsOf(txt) {
  const out = [];
  let fence = false;
  for (const line of String(txt || '').split(/\r?\n/)) {
    if (/^\s*```/.test(line)) { fence = !fence; continue; }
    if (fence) continue;
    const m = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (m) out.push(m[1].replace(/^\d+[.)]\s*/, '').trim());
  }
  return out;
}

/**
 * 분류(순수): 경로 + 헤딩 → { home, domain, confidence, label, why }.
 * 점수 = 디렉터리 3 + 파일명 1 + 헤딩 1, 동점은 규칙 순서. 디렉터리가 파일명 키워드보다 무겁다 — 이식 전 사본 실측에서
 * `proposals/handoff_compaction.md` 가 파일명(handoff)+헤딩(인계)으로 HANDOFF 에 갔다([WO-29a-11]).
 */
function classify(file, headings = []) {
  const dir = `${path.posix.dirname(file)}/`, name = path.posix.basename(file);
  let best = null;
  for (const r of RULES) {
    const d = dir !== './' && r.path.test(dir), h = headings.some(x => r.head.test(x));
    const n = r.path.test(name) || (!!r.root && dir === './' && r.root.test(name));
    const score = (d ? 3 : 0) + (n ? 1 : 0) + (h ? 1 : 0);
    if (score && (!best || score > best.score)) best = { r, d, n, h, score };
  }
  if (!best) return { home: null, domain: null, confidence: 'low', label: null, why: '경로·헤딩 신호 없음' };
  const { r, d, n, h } = best;
  // high = 디렉터리 + 헤딩 만(인간 판정 2026-10-20, [PRO-29] §7-4) — 파일명+헤딩은 평평한 트리 실측에서 high 1/6 이었다.
  return { home: r.home, domain: r.domain, confidence: d && h ? 'high' : 'medium', label: r.label,
    why: `${r.label} — ${[d ? '디렉터리' : null, n ? '파일명' : null, h ? '헤딩' : null].filter(Boolean).join('+')}` };
}

/** 파일명 → ZFS slug(ASCII snake). 비ASCII 만이면 경로 해시(결정적). */
function slugOf(file) {
  const base = path.posix.basename(file).replace(/\.md$/i, '');
  // 선행 숫자 묶음(ADR 서수 0001- · 날짜 2026-01-)은 **뒤에 단어가 있을 때만** 뗀다 — 날짜뿐인 회의록 이름(2015-05-27)은 날짜가 곧 이름이다(OSS 실측: MTG-01_27 로 날짜 소실).
  const snake = base.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const s = /^(\d+_)+[a-z]/.test(snake) ? snake.replace(/^(\d+_)+/, '') : snake;
  if (!s) return `doc_${crypto.createHash('sha1').update(file).digest('hex').slice(0, 6)}`;
  return /^\d/.test(s) ? `doc_${s}` : s;   // ZFS slug 는 글자로 시작한다
}

/** ID·자리 부여(순수): 경로 정렬 순으로 도메인별 01, 02, … low 행은 to 없음. */
function assignIds(rows) {
  const counters = {};
  return [...rows].sort((a, b) => a.from.localeCompare(b.from)).map(row => {
    const rule = RULES.find(r => r.home === row.home);
    if (!rule || row.confidence === 'low') return { ...row, proposedId: null, to: null };
    // kind 는 적용기(③(b))가 읽는다 — id 는 git mv · dir 은 원래 이름으로 git mv · file 은 옮기지 않고 링크 목록([WO-29a-12]).
    // file 자리의 글롭(IDENTITY*.md)은 실제 파일 하나로 — 적용기가 그 파일에 링크 목록을 쓴다(OSS 실측: README → `IDENTITY*.md` 가 그대로 경로로 나갔다).
    if (rule.kind === 'file') return { ...row, kind: 'file', proposedId: null, to: rule.home.replace('*', '') };
    if (rule.kind === 'dir') return { ...row, kind: 'dir', proposedId: null, to: `${rule.dir}/${path.posix.basename(row.from)}` };
    counters[rule.domain] = (counters[rule.domain] || 0) + 1;
    const id = `${rule.domain}-${String(counters[rule.domain]).padStart(2, '0')}`;
    return { ...row, kind: 'id', proposedId: id, to: `${rule.dir}/${id}_${slugOf(row.from)}.md` };
  });
}

// adapter.json 초안의 어휘(잠정) — 대상에 **실재하는** 표기만 별칭 후보로 싣는다.
const SECTION_HINTS = {
  '목표': /goal|objective|purpose|목적|목표/i,
  '수용 기준': /acceptance|definition of done|done criteria|완료 기준|수용 기준|인수 기준/i,
  '증거': /evidence|verification|validation|results?\b|검증|증거|결과/i,
};
const STATUS_HINTS = [
  [/^(done|complete|completed|finished|closed|resolved)$/i, 'Closed'],
  [/^(in[ -]?progress|doing|wip|active|started|ongoing)$/i, 'Active'],
  [/^(todo|to[ -]?do|backlog|planned|open|new|draft|proposed)$/i, 'Draft'],
  [/^(review|in[ -]?review|testing|qa|verifying|verification)$/i, 'Verifying'],
];

/** adapter.json 초안(순수): sections(필수 3절 별칭 후보) · statusMap · localOwned. 모르는 status 는 unmappedStatus 로(사람이 정한다). */
function draftAdapter({ workDocs = [], statuses = [], scripts = [] }) {
  const sections = {};
  const heads = [...new Set(workDocs.flatMap(d => d.headings || []))];
  for (const [key, re] of Object.entries(SECTION_HINTS)) {
    const found = heads.filter(h => re.test(h));
    if (found.length) sections[key] = found;
  }
  const statusMap = {}, unmapped = [];
  for (const v of [...new Set(statuses.filter(Boolean))]) {
    const hit = STATUS_HINTS.find(([re]) => re.test(v));
    if (hit) statusMap[v] = hit[1]; else unmapped.push(v);
  }
  return { sections, statusMap, unmappedStatus: unmapped, localOwned: [...scripts].sort() };
}

const SKIP_DIRS = new Set(['.git', 'node_modules', '.union-stack', 'dist', 'build', 'out', 'vendor', 'coverage', '.next', '.venv', 'venv', 'target']);

/** 스캔(읽기만): md 문서의 경로·헤딩·status · scripts/ 파일 목록. */
function scan(root) {
  const docs = [], scripts = [];
  const walk = rel => {
    let ents = [];
    try { ents = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(r); continue; }
      if (r.startsWith('scripts/')) scripts.push(r);
      if (!/\.md$/i.test(e.name)) continue;
      let txt = '';
      try { txt = fs.readFileSync(path.join(root, r), 'utf8'); } catch { continue; }
      const fm = txt.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      const st = fm && fm[1].match(/^status:\s*["']?([^"'\r\n#]+?)["']?\s*$/m);
      docs.push({ file: r, headings: headingsOf(txt), status: st ? st[1].trim() : null });
    }
  };
  walk('');
  return { docs, scripts };
}

/** 계획(읽기만): 스캔 → 매핑안 행 · adapter 초안 · 요약. 이미 .union-stack 이 있으면 이식 대상이 아니다(키트·template-update). */
function plan(root) {
  if (fs.existsSync(path.join(root, '.union-stack'))) throw new Error('이미 .union-stack/ 이 있다 — 이식 대상이 아니다(손 이식 어답터는 키트 · 갱신은 template-update)');
  const { docs, scripts } = scan(root);
  const rows = assignIds(docs.map(d => ({ from: d.file, ...classify(d.file, d.headings) })));
  const workDocs = docs.filter(d => rows.find(r => r.from === d.file && r.domain === 'WO'));
  const adapter = draftAdapter({ workDocs, statuses: docs.map(d => d.status), scripts });
  const summary = { high: 0, medium: 0, low: 0, invalidNames: 0 };
  for (const r of rows) summary[r.confidence]++;
  // 제안 이름의 ZFS 유효성을 스스로 센다 — OSS 실측에서 날짜 회의록 396 행이 전부 무효였는데 픽스처가 못 잡았다([WO-29a-11]).
  const { isValidName } = require('./zfs_util');
  for (const r of rows) if (r.proposedId && !isValidName(path.posix.basename(r.to))) { summary.invalidNames++; r.invalidName = true; }
  return { rows, adapter, summary };
}

module.exports = { RULES, migrationHomes, headingsOf, classify, slugOf, assignIds, draftAdapter, scan, plan, SKIP_DIRS };
