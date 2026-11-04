// scripts/zfs_index.js
// 레포 전역에서 ZFS 문서를 수집해 인덱스로 반환한다.
// upward-fetch.js / blast-radius.js 가 공유하는 색인 계층.
const fs = require('fs');
const path = require('path');
const { parse } = require('./zfs_util');
const { walkFiles } = require('./fs_walk');
const { load: loadAdapter, mapStatus, arithmeticApplies } = require('./adapter');

// ZFS ID를 갖는 원자적 문서가 사는 디렉터리(.union-stack/ 격리 구조, 린터와 동일 집합).
const BASE = '.union-stack';
const SCAN_DIRS = [
  'plan', 'feature/flow', 'sprint', 'architecture', 'verification',
  'reference/contracts', 'reference/lessons', 'reference/domain', 'reference/tools',
  'project/roadmap', 'proposals',
].map(d => `${BASE}/${d}`);

// frontmatter(선두 --- 블록)에서만 status·tier를 추출. 없으면 null.
// 파일 전체 매칭은 본문 예시(`status: Live` 코드블록 등)를 잠금 상태로 오인해
// blast-radius 오차단(false Fail-close)을 일으킨다. 선두 HTML 주석은 건너뛴다.
// tier(신뢰도 티어, [PRO-12]): draft | reviewed | ratified — 미기입은 null(기존 문서 = ratified 간주는
// 소비자(permission-guard) 몫이고, 색인은 관측만 한다).
function readFront(full) {
  try {
    const txt = fs.readFileSync(full, 'utf8');
    const fm = txt.match(/^(?:\s|<!--[\s\S]*?-->)*---\r?\n([\s\S]*?)\r?\n---/);
    if (!fm) return { status: null, tier: null };
    const g = k => { const m = fm[1].match(new RegExp('^\\s*' + k + ':\\s*(.+?)\\s*$', 'm')); return m ? m[1].trim() : null; };
    const tier = g('tier');
    return {
      status: g('status'), tier: tier ? tier.toLowerCase() : null,
      consumers: parseConsumers(fm[1]), concerns: parseList(fm[1], 'concern'),
      parents: parseParents(fm[1]),
      // 선택적 라벨 override([PRO-26] ①) — 2~16자 소문자·숫자·_-. 형식 밖은 null(label.js 가 다시 검증).
      mnemonic: (() => { const v = g('mnemonic'); return v ? v.replace(/\s+#.*$/, '').replace(/^["']|["']$/g, '').trim() : null; })(),
    };
  } catch {
    return { status: null, tier: null, consumers: [], concerns: [], parents: [], mnemonic: null };
  }
}

/**
 * `consumers:` 목록 파싱(순수) — 계약의 **계보 밖 간선**([PRO-16]).
 * 계약은 포함관계가 아닌 당사자끼리 공유되므로 ZFS 계보 산술(트리)로는 소비자를 표현할 수 없다.
 * 인라인 `[A, B]`와 블록 `- A` 둘 다 받는다(work-close 의 listField 와 같은 관용).
 * 값은 `DOMAIN-id` 표기이며 브래킷을 붙여도 벗긴다.
 */
function parseConsumers(fm) { return parseList(fm, 'consumers'); }

/** frontmatter 목록 필드 파싱(순수). 인라인 `[A, B]`와 블록 `- A` 둘 다, 따옴표·브래킷은 벗긴다. */
function parseList(fm, key) {
  const s = String(fm || '');
  const norm = v => v.trim().replace(/^["'[]+|["'\]]+$/g, '').trim();
  const inline = s.match(new RegExp('^[ \\t]*' + key + ':[ \\t]*\\[(.*?)\\][ \\t]*$', 'm'));
  if (inline) return inline[1].split(',').map(norm).filter(Boolean);
  const head = s.match(new RegExp('^[ \\t]*' + key + ':[ \\t]*$', 'm'));
  if (!head) return [];
  const out = [];
  for (const line of s.slice(head.index + head[0].length).split(/\r?\n/).slice(1)) {
    const item = line.match(/^[ \t]*-[ \t]+(.*)$/);
    if (!item) break;
    const v = norm(item[1]);
    if (v) out.push(v);
  }
  return out;
}

/**
 * 참조 목록 필드(순수) — 스칼라(`parent: PRO-27`) · 인라인(`[A, B]`) · 블록(`- A`) 전부. 끝 주석(`# …`)·따옴표·브래킷은 벗긴다.
 * `DOMAIN-ID` 꼴만 남긴다 — `up:` 상류 참조([PRO-27] ①)는 로컬 부모가 아니므로 빠진다.
 */
function parseRefList(fm, key) {
  const s = String(fm || '');
  const m = s.match(new RegExp('^[ \\t]*' + key + ':[ \\t]*(.*)$', 'm'));
  if (!m) return [];
  const v = m[1].replace(/\s+#.*$/, '').trim();
  let items;
  if (!v) items = parseList(fm, key);
  else if (/^\[.*\]$/.test(v)) items = v.slice(1, -1).split(',');
  else items = [v];
  return items.map(x => x.trim().replace(/^["'[]+|["'\]]+$/g, '').trim()).filter(x => /^[A-Z]{2,6}-[0-9][0-9a-z-]*$/.test(x));
}

/** frontmatter 부모(순수) — `parent:` ∪ `plan:`([PRO-27] ③). 우산 WO·중간 PLAN 도 부모가 될 수 있다(도메인 무관). */
function parseParents(fm) { return [...new Set([...parseRefList(fm, 'parent'), ...parseRefList(fm, 'plan')])]; }

function readStatus(full) { return readFront(full).status; }

function collect(dir, root, out, cfg = null) {
  walkFiles(root, dir, rel => {
    const entry = rel.split('/').pop();
    if (!entry.endsWith('.md')) return;
    const parsed = parse(entry); // {domain, id, slug} 또는 null(가이드·매니페스트)
    if (!parsed) return;
    const front = readFront(path.join(root, rel));
    // status 는 어답터 statusMap 으로 매핑한 값([PRO-27] ② — 로컬 어휘를 강제하지 않고 읽는다), 원문은 rawStatus.
    out.push({ file: rel, ...parsed, status: mapStatus(cfg, front.status), rawStatus: front.status, tier: front.tier,
      consumers: front.consumers || [], concerns: front.concerns || [],
      // 계보([PRO-27] ③): 선언 부모 + 이 ID 에 산술 상속이 적용되는가(레거시 독립 채번 구간은 false).
      parents: front.parents || [], arithmetic: arithmeticApplies(cfg, parsed.id), mnemonic: front.mnemonic || null });
  });
}

/** 레포 루트 기준 전체 ZFS 문서 인덱스를 만든다. */
function buildIndex(root = path.resolve(__dirname, '..')) {
  const out = [];
  const cfg = loadAdapter(root);
  SCAN_DIRS.forEach(d => collect(d, root, out, cfg));
  return out;
}

module.exports = { buildIndex, readStatus, readFront, parseConsumers, parseList, parseParents, parseRefList, SCAN_DIRS };
