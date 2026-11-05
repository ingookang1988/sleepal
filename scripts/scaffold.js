#!/usr/bin/env node
// scripts/scaffold.js
// 뼈대 생성기([PRO-28] ④ · [TOOL-36]) — 새 WO 를 "직전 WO 복사 + 손 수정"이 아니라 한 줄로 찍는다.
// 회신 2곳·센서스 3회차 실측: 변종 헤딩(한 의미에 3~5 표기)·중복 ID·빈 status 는 전부 손 복사에서 생겼다. 린트(사후)보다 생성(사전)이 싸다.
//
// 하는 것: ① 전역 다음 번호 **제안**(산술 범위면 부모 아래 다음 자식, 레거시 구간이면 도메인 전역 최대+1 — [PRO-27] ③ 존중)
//         ② parent 의 ZFS **실존 확인**(도메인+ID — 없으면 CLARIFY, 파일 안 만듦)
//         ③ 뼈대 = frontmatter(status Draft · parent · evidence `none — …` · closed_by []) + 필수 3절(어답터 표기는 adapter.json sections 의 **첫 별칭**) + 선택 절 안내 1줄.
//            성공 바 ≤ MAX_TOKENS(400) — 뼈대가 짐이 되면 안 된다.
// 하지 않는 것: 본문 작성·요약([ADR-12]) · 기존 문서 수정 · WO 외 도메인(요구가 생기면 확장 — 미지원 CLARIFY).
// 기본은 dry-run(계획 + 본문 출력). `--write` 만 파일을 만든다. 같은 파일이 있으면 거부.
// 실행: node scripts/scaffold.js WO --parent PLAN-01a [--title …] [--slug …] [--lineage b] [--id 01a-3] [--write] [--json] [--contract]
const fs = require('fs');
const path = require('path');
const { buildIndex } = require('./zfs_index');
const { parseId, isValidName } = require('./zfs_util');
const { load: loadAdapter, arithmeticApplies, SECTION_KEYS, isTemplateRepo } = require('./adapter');
const { prefixUpstreamRefs } = require('./ref-linter');
const { estimateTokens } = require('./context-budget');
const { withContract, OUTCOME } = require('./gate-contract');

const CONTRACT = {
  gate: 'Scaffold (scaffold — WO 뼈대 생성기)',
  input: '도메인(WO) · --parent DOMAIN-ID · --title/--slug · adapter.json sections(절 표기)·lineage.arithmeticFrom(채번 구간) · ZFS 색인(실존·기존 ID)',
  predicate: 'parent 가 색인에 실존하고(도메인+ID), 제안 ID 가 기존 ID 와 겹치지 않으며, 뼈대가 발행 계약 3절 + frontmatter 를 갖추고 MAX_TOKENS 이내다. --write 는 없는 파일만 만든다',
  scope: '뼈대만 — 본문·수용 기준의 내용은 쓰지 않는다. 번호는 제안이지 예약이 아니다(동시 발행은 사람이 조정). WO 외 도메인 미지원',
  outcomes: ['PASS', 'CLARIFY'],
  failure_mode: 'parent 부재·ID 충돌·파일 존재·slug 불가·도메인 미지원 → CLARIFY(질문 한 줄, 파일 안 만듦). 그 외 PASS(dry-run 또는 생성)',
};

const MAX_TOKENS = 400;
const SUPPORTED = new Set(['WO']);
const DIR = { WO: '.union-stack/sprint' };
const LINEAGE_RE = /^[a-km-np-z]$/; // ZFS ID 문법의 글자(l·o 제외 — 1·0 과 혼동)

/** 색인에서 `DOMAIN-ID` 실존(순수) — 도메인까지 맞아야 실존(다른 도메인의 동일 계보는 죽은 부모를 가리지 못한다). */
function findParent(index, ref) {
  const m = String(ref || '').match(/^([A-Z]{2,6})-(.+)$/);
  if (!m) return null;
  const id = parseId(m[2]) || m[2];
  return index.find(d => d.domain === m[1] && d.id === id) || null;
}

/**
 * 다음 번호 제안(순수). 산술 범위: 부모가 글자로 끝나면 `${parent}-N`, 숫자로 끝나면 `${parent}${lineage}-N`(기본 a). N = 같은 접두의 최대 + 1.
 * 레거시(부모 번호가 arithmeticFrom 아래): 도메인 전역 최대 번호 + 1 — 독립 채번 구간은 부모와 번호가 무관하므로 겹침만 피한다.
 * 반환 {id, basis} | null(계보 글자 불가).
 */
function proposeId(index, { domain, parentId, lineage = 'a', cfg = null }) {
  if (!LINEAGE_RE.test(lineage)) return null;
  const same = index.filter(d => d.domain === domain);
  if (!arithmeticApplies(cfg, parentId)) {
    const max = same.reduce((m, d) => { const h = String(d.id).match(/^\d+/); return h ? Math.max(m, parseInt(h[0], 10)) : m; }, 0);
    return { id: String(max + 1), basis: 'legacy-max' };
  }
  // 숫자 끝 부모 아래 **글자 자식 계열**(66a·66b…)이 있고 -N 자식은 없으면 다음 글자(l·o 건너뜀, z 소진 → null). 어답터 A 실측: 66a…66t 가 있는데 66a-1 을 제안 — 오분기 발생원.
  if (/[0-9]$/.test(parentId)) {
    const esc = parentId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const letters = same.map(d => String(d.id).match(new RegExp('^' + esc + '([a-km-np-z])$'))).filter(Boolean).map(m => m[1]);
    const hyphen = same.some(d => new RegExp('^' + esc + '[a-km-np-z]+-\\d+$').test(String(d.id)));
    if (letters.length && !hyphen) {
      let c = letters.sort().pop().charCodeAt(0) + 1;
      while (c <= 122 && /[lo]/.test(String.fromCharCode(c))) c++;
      return c > 122 ? null : { id: parentId + String.fromCharCode(c), basis: 'letter-series' };
    }
  }
  const prefix = /[0-9]$/.test(parentId) ? parentId + lineage : parentId;
  const re = new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-(\\d+)$');
  const max = same.reduce((m, d) => { const x = String(d.id).match(re); return x ? Math.max(m, parseInt(x[1], 10)) : m; }, 0);
  return { id: `${prefix}-${max + 1}`, basis: 'arithmetic' };
}

/** 필수 3절의 표기(순수): adapter.json sections 의 첫 별칭, 없으면 상류 표기([PRO-28] §7 잠정 — 그 레포 관행 유지). */
function sectionNames(cfg) {
  const map = (cfg && cfg.sections) || {};
  return [...SECTION_KEYS].map(k => (Array.isArray(map[k]) && map[k][0]) || k);
}

/** slug(순수): 명시 slug 우선 → ASCII 제목에서 파생 → 비ASCII 만이면 null. ZFS 문법 [a-z][a-z0-9_]* 로 정규화. */
function slugOf(slug, title) {
  const src = slug && String(slug).trim() ? String(slug) : String(title || '');
  let s = src.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/_+/g, '_');
  if (!s) return null;
  if (/^[0-9]/.test(s)) s = 'w' + s;
  return s;
}

/** 뼈대 본문(순수). 선택 절은 주석 한 줄로만 안내 — 뼈대가 예산을 먹으면 안 된다. */
function renderBody({ domain, id, title, parent, sections, adopter = false }) {
  const [goal, accept, evidence] = sections;
  // 머리글의 상류 ID 는 어답터에서 [up:ID]([WO-29a-3]) — 로컬 ID(parent·자기)는 그대로다.
  const head = `<!-- [Wiki] 작업 지시. 상태 정본은 이 frontmatter \`status:\` 하나뿐이다([PRO-15]). scaffold 생성 — 선택 절(배경·설계·절차)은 필요할 때만 추가. -->`;
  return [
    adopter ? prefixUpstreamRefs(head) : head,
    '---',
    `id: ${domain}-${id}`,
    `title: ${title}`,
    'status: Draft',
    `parent: ${parent}`,
    'evidence: "none — 착수 전"',
    'closed_by: []',
    'version: 1.0',
    '---',
    `# [${domain}-${id}] ${title}`,
    '',
    `## ${goal}`,
    '',
    '',
    `## ${accept}`,
    '- ',
    '',
    `## ${evidence}`,
    '- 닫을 때 frontmatter `evidence:` 에 값 또는 `none — 이유`(선언 검사가 있으면 `rcpt:<name>@<sha>`). 상위 축 흔적은 `closed_by:`.',
    '',
  ].join('\n');
}

/** 계획(루트 읽기만): {ok, issues[], domain, id, basis, file, body, tokens, parent}. */
function plan(root, { domain, parent, title, slug, lineage = 'a', id: forcedId, write = false }) {
  const issues = [];
  if (!SUPPORTED.has(domain)) return { ok: false, issues: [`도메인 ${domain || '(없음)'} 은 미지원 — 지금은 WO 만(요구가 생기면 확장)`] };
  if (!parent) return { ok: false, issues: ['--parent DOMAIN-ID 가 필요하다 — WO 는 부모 없이 발행하지 않는다([PRO-19])'] };
  const cfg = loadAdapter(root);
  const index = buildIndex(root);
  const pdoc = findParent(index, parent);
  if (!pdoc) issues.push(`parent ${parent} 가 ZFS 색인에 없다 — ID 또는 도메인을 확인하라(죽은 부모로는 발행하지 않는다)`);
  const prop = pdoc ? proposeId(index, { domain, parentId: pdoc.id, lineage, cfg }) : null;
  if (pdoc && !prop) issues.push(`--lineage 는 한 글자(a-z, l·o 제외)여야 한다: ${lineage}`);
  const id = forcedId || (prop && prop.id) || null;
  if (id && index.some(d => d.domain === domain && d.id === id)) issues.push(`${domain}-${id} 는 이미 있다 — 번호를 비우면 다음 번호를 제안한다`);
  const sl = slugOf(slug, title);
  if (!sl) issues.push('slug 를 만들 수 없다 — 비ASCII 제목이면 `--slug <ascii_snake>` 를 함께 주라');
  const t = (title && String(title).trim()) || (sl ? sl.replace(/_/g, ' ') : '');
  if (issues.length) return { ok: false, issues, domain, id, parent };
  const file = `${DIR[domain]}/${domain}-${id}_${sl}.md`;
  if (!isValidName(path.basename(file))) return { ok: false, issues: [`파일명이 ZFS 문법에 맞지 않는다: ${path.basename(file)}`], domain, id, parent };
  if (fs.existsSync(path.join(root, file))) return { ok: false, issues: [`${file} 이 이미 있다 — 덮어쓰지 않는다`], domain, id, parent, file };
  const body = renderBody({ domain, id, title: t, parent, sections: sectionNames(cfg), adopter: !isTemplateRepo(root) });
  const tokens = estimateTokens(body);
  if (tokens > MAX_TOKENS) issues.push(`뼈대가 ${tokens} tok — 상한 ${MAX_TOKENS}(뼈대는 짐이 되면 안 된다)`);
  return { ok: !issues.length, issues, domain, id, basis: prop ? prop.basis : 'forced', file, body, tokens, parent, written: false, write };
}

function parseArgs(argv) {
  const o = { domain: null, parent: null, title: null, slug: null, lineage: 'a', id: null, write: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { const v = argv[i + 1]; if (v == null || v.startsWith('--')) return null; i++; return v; };
    if (a === '--parent') o.parent = val();
    else if (a === '--title') o.title = val();
    else if (a === '--slug') o.slug = val();
    else if (a === '--lineage') o.lineage = val() || 'a';
    else if (a === '--id') o.id = val();
    else if (a === '--write') o.write = true;
    else if (a === '--json') o.json = true;
    else if (!a.startsWith('--') && !o.domain) o.domain = a.toUpperCase();
  }
  return o;
}

function run(argv = process.argv.slice(2), root = path.resolve(__dirname, '..')) {
  const o = parseArgs(argv);
  const p = plan(root, o);
  if (p.ok && o.write) {
    fs.mkdirSync(path.dirname(path.join(root, p.file)), { recursive: true });
    fs.writeFileSync(path.join(root, p.file), p.body);
    p.written = true;
  }
  if (o.json) { console.log(JSON.stringify(p, null, 2)); return p.ok ? OUTCOME.PASS : OUTCOME.CLARIFY; }
  if (!p.ok) {
    console.error(`\n[scaffold] CLARIFY — 만들지 않았다:`);
    p.issues.forEach(m => console.error(`  ? ${m}`));
    console.error('');
    return OUTCOME.CLARIFY;
  }
  console.log(`# scaffold ${p.domain}-${p.id} (${p.basis === 'legacy-max' ? '레거시 전역 최대+1' : p.basis === 'forced' ? '지정 ID' : '부모 아래 다음 자식'}) ← parent ${p.parent}`);
  console.log(`  파일: ${p.file}  ·  ${p.tokens} tok / 상한 ${MAX_TOKENS}`);
  if (p.written) console.log('  생성됨. 다음: 본문 작성 → `node scripts/work-close.js --table --write`(작업대 뷰) → status 를 Active 로.');
  else { console.log('  dry-run — 아래 본문을 확인하고 `--write` 로 만든다.\n'); console.log(p.body); }
  return OUTCOME.PASS;
}

module.exports = { proposeId, findParent, sectionNames, slugOf, renderBody, plan, parseArgs, run, CONTRACT, MAX_TOKENS, SUPPORTED };

if (require.main === module) process.exit(withContract(CONTRACT, argv => run(argv))());
