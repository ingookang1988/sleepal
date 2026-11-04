// scripts/adapter.js
// 어답터 설정 표면 — **sync 파일을 고치지 않고** 어답터 형상을 선언하는 단 하나의 자리.
//
// 왜 필요한가(실측): sync 카테고리는 "덮어써도 잃을 것이 없다"가 전제인데, 실전 어답터는
// sync 파일에 *정당한* 개조를 갖는다. LifeSaju 어답터는 3건을 반복 재적용하고 있었고
// `template-update --apply` 가 그중 2건을 조용히 덮어써 게이트 2개가 즉시 FAIL 했다.
// 원인은 개조가 나쁘다는 게 아니라 **개조를 담을 표면이 없었다**는 것이다. 그 표면이 이 파일이다.
//
// 위치가 `.union-stack/adapter.json` 인 이유: template-update 의 `classifyPath` 가 이 경로를
// sync 도 review 도 아닌 **불가침**(null)으로 분류한다 — 즉 어답터 소유이고 상류가 절대 건드리지
// 않는다. `package.json` 의 필드로 두는 안은 그 반대다(package.json 은 review 카테고리라
// 상류 변경과 어답터 설정이 같은 파일에서 충돌한다).
//
// 소비처(각 도구가 이 모듈을 읽는다 — 새 규약을 만들지 않는다):
//   · `private`     → health.js 의 leakage gate 를 FAIL 대신 INFO 로 강등. 누설 가드는 **공개
//                     템플릿 보호용**이라 비공개 실콘텐츠 레포에서는 의미가 반전된다(실콘텐츠가 정상).
//                     게이트 자체(`leakage-guard.js`)는 그대로 둔다 — 강등은 *점수표*의 판정이다.
//   · `zfsIgnored`  → zfs-linter 의 면제 목록에 합산(어답터 고유 매니페스트 파일명).
//   · `statusMap`   → 로컬 상태 어휘 → 상류 어휘 매핑([PRO-27] ②). zfs_index·work-close 가 읽기 시 적용하고 원문은 rawStatus 로
//                     남긴다. 어휘를 **강제하지 않는다** — 매핑에 없는 값은 그대로 산다(어답터 실측: `Done`·`Review`·status 38종).
//   · `evidenceFields` → 상류 필드(evidence·closed_by) 의 로컬 별칭 배열. 상류 필드가 있으면 그것이 우선, 없으면 별칭 순서대로.
//   · `checks[]`    → 어답터의 제품 검사 선언([PRO-22] §3-1): name · cmd · blocking · runs_on · covers · kind(정적·동작·재현·측정·수용·메타) ·
//                     env · cost(push·nightly·manual-paid) · expected_zero_unless(diff·env) · scope · runner · known_failures. ci.js 가 돌리고 영수증을 쓴다.
//   · `localOwned`  → 어답터 고유 파일 글롭([PRO-24] ①(b)). template-update 가 이 파일들을 템플릿 소유로 보지 않는다("상류에서 사라진 파일" 오보 0,
//                     `--apply` 가 건드리지 않음). 상류 매니페스트가 열거한 파일과 글롭이 겹치면 sync 가 우선이다(경고).
//   · `sections`    → 발행 계약 3절의 어답터 표기 별칭 맵([PRO-28] ①) {"목표":["목적","목적·진입 조건"], "수용 기준":[…], "증거":[…]}. 정규화(선두 번호·공백) 뒤
//                     정확 → 접두 일치. 매칭 실패는 CLARIFY. 문서는 안 고친다(센서스 3회차: 한 의미에 표기 3~5종, `## 증거` 0건 — 증거는 frontmatter evidence 로 충족).
//   · `sectionsExclude` → 별칭에 걸려도 밀어낼 헤딩(정규화 뒤 정확·토큰 경계 접두) — "진행 기록"·"비목표" 처럼 토큰이 겹치지만 의미가 다른 절.
//   · `budgets`     → 부트스트랩 예산 재캘리브레이션 {project·profile·handoff·total}(양수 토큰). context-budget·handoff-linter·health·dashboard 가
//                     기본값 대신 쓴다 — 어답터 실측: 예산을 스크립트 포크로 박아 두면 갱신마다 소실 위험.
//   · `upstreamIgnored` → 상류 파일 **거부** 글롭. template-update 가 배송·보고에서 뺀다(localOwned 와 달리 매니페스트 배송보다 우선) —
//                     어답터 실측: Actions 를 폐기한 레포에 harness.yml 이 매 --apply 마다 돌아옴. scripts/ 거부는 게이트 약화일 수 있어 보고서가 경고.
//   · `retro`       → 회고 트리거 임계([PRO-25] ①): issuance·archiveDebt·staleDays·staleCount·gcPlans·planeLagDays·distill·ledgerKb(숫자) + off(지표 끄기 배열).
//   · `lineage.arithmeticFrom` → 그 번호부터만 ID 산술 상속([PRO-27] ③). 레거시 독립 채번 구간(같은 번호가 도메인마다 다른 문서)은
//                     frontmatter 부모만 본다. 기본 0 = 전부 산술(상류 자신의 형상).
//
// 설정은 **선언이고 검증 대상**이다: 알 수 없는 키·형식 오류는 조용히 삼키지 않고 `warnings` 로
// 낸다(설정 오타가 "적용된 줄 알았는데 아니었다"로 끝나는 것이 이 부류 도구의 표준 사고).
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = '.union-stack/adapter.json';
const DEFAULTS = { private: false, zfsIgnored: [], statusMap: {}, evidenceFields: {}, lineage: { arithmeticFrom: 0 }, checks: [], retro: {}, localOwned: [], budgets: {}, upstreamIgnored: [], sections: {}, sectionsExclude: [] };
const KNOWN_KEYS = new Set(['private', 'zfsIgnored', 'statusMap', 'evidenceFields', 'lineage', 'checks', 'retro', 'localOwned', 'budgets', 'upstreamIgnored', 'sections', 'sectionsExclude', '$schema']);
// 발행 계약의 필수 3절([PRO-19] — sprint/_GUIDE §Anatomy). [PRO-28] ①: 키는 이 상류 *의미*, 값은 어답터 표기 별칭(1:N).
const SECTION_KEYS = new Set(['목표', '수용 기준', '증거']);
// 부트스트랩 예산 재캘리브레이션 키(어답터 실측: 포크로 handoff 2200 을 박아 두면 매 갱신이 소실 위험) — context-budget BUDGETS + total.
const BUDGET_KEYS = new Set(['project', 'profile', 'handoff', 'total']);
const RETRO_KEYS = new Set(['issuance', 'archiveDebt', 'staleDays', 'staleCount', 'gcPlans', 'planeLagDays', 'distill', 'ledgerKb', 'off']);
// 검사 선언의 닫힌 어휘([PRO-22] v1.0) — 6분류·3비용·0건 조건 2종.
const CHECK_KINDS = new Set(['정적', '동작', '재현', '측정', '수용', '메타']);
const CHECK_COSTS = new Set(['push', 'nightly', 'manual-paid']);
const ZERO_CONDS = new Set(['diff', 'env']);
const LINEAGE_KEYS = new Set(['arithmeticFrom']);
// evidenceFields 가 별칭을 달 수 있는 상류 필드 — work-close 의 닫힘 계약이 읽는 둘뿐이다.
const ALIASABLE_FIELDS = new Set(['evidence', 'closed_by']);
const fresh = present => ({ ...DEFAULTS, zfsIgnored: [], statusMap: {}, evidenceFields: {}, lineage: { arithmeticFrom: 0 }, checks: [], retro: {}, localOwned: [], budgets: {}, upstreamIgnored: [], sections: {}, sectionsExclude: [], warnings: [], present });

/**
 * JSON 텍스트 → 정규화된 설정(순수 — FS 비의존).
 * 반환: {private, zfsIgnored, warnings[], present}
 * 파싱 실패도 **관측 결과**다 — 기본값으로 진행하되 경고를 남긴다(설정 파일 하나가 게이트 전체를
 * 죽이면 안 된다: 이 모듈은 게이트가 아니라 게이트의 입력이다).
 */
function parseConfig(txt) {
  const out = fresh(true);
  let j;
  try { j = JSON.parse(String(txt)); } catch (e) {
    out.warnings.push(`${CONFIG_PATH} 파싱 실패 — 기본값으로 진행: ${e.message}`);
    return out;
  }
  if (!j || typeof j !== 'object' || Array.isArray(j)) {
    out.warnings.push(`${CONFIG_PATH} 최상위가 객체가 아님 — 기본값으로 진행`);
    return out;
  }
  for (const k of Object.keys(j)) {
    if (!KNOWN_KEYS.has(k)) out.warnings.push(`${CONFIG_PATH}: 알 수 없는 키 '${k}' — 무시됨(오타 확인)`);
  }
  if ('private' in j) {
    if (typeof j.private === 'boolean') out.private = j.private;
    else out.warnings.push(`${CONFIG_PATH}: 'private' 는 boolean 이어야 함 — 무시됨`);
  }
  if ('zfsIgnored' in j) {
    if (Array.isArray(j.zfsIgnored) && j.zfsIgnored.every(x => typeof x === 'string')) {
      // 파일**명**만 받는다(zfs-linter 의 IGNORED 와 같은 의미론). 경로가 오면 경고 후 basename 사용.
      out.zfsIgnored = j.zfsIgnored.map(s => {
        const base = s.split('/').pop();
        if (base !== s) out.warnings.push(`${CONFIG_PATH}: 'zfsIgnored' 는 파일명만 받는다 — '${s}' → '${base}'`);
        return base;
      }).filter(Boolean);
    } else out.warnings.push(`${CONFIG_PATH}: 'zfsIgnored' 는 문자열 배열이어야 함 — 무시됨`);
  }
  if ('statusMap' in j) {
    const m = j.statusMap;
    if (m && typeof m === 'object' && !Array.isArray(m)) {
      for (const [k, v] of Object.entries(m)) {
        if (typeof v === 'string' && v.trim()) out.statusMap[k] = v.trim();
        else out.warnings.push(`${CONFIG_PATH}: 'statusMap.${k}' 는 비지 않은 문자열이어야 함 — 무시됨`);
      }
    } else out.warnings.push(`${CONFIG_PATH}: 'statusMap' 은 {로컬: 상류} 객체여야 함 — 무시됨`);
  }
  if ('evidenceFields' in j) {
    const e = j.evidenceFields;
    if (e && typeof e === 'object' && !Array.isArray(e)) {
      for (const [k, v] of Object.entries(e)) {
        if (!ALIASABLE_FIELDS.has(k)) { out.warnings.push(`${CONFIG_PATH}: 'evidenceFields.${k}' — 별칭을 달 수 있는 상류 필드는 ${[...ALIASABLE_FIELDS].join('·')} 뿐 — 무시됨`); continue; }
        if (Array.isArray(v) && v.every(x => typeof x === 'string' && x.trim())) out.evidenceFields[k] = v.map(x => x.trim());
        else out.warnings.push(`${CONFIG_PATH}: 'evidenceFields.${k}' 는 문자열 배열이어야 함 — 무시됨`);
      }
    } else out.warnings.push(`${CONFIG_PATH}: 'evidenceFields' 는 {상류필드: [별칭]} 객체여야 함 — 무시됨`);
  }
  if ('checks' in j) {
    if (Array.isArray(j.checks)) {
      j.checks.forEach((c, i) => {
        if (!c || typeof c !== 'object' || typeof c.name !== 'string' || !c.name.trim() || typeof c.cmd !== 'string' || !c.cmd.trim()) {
          out.warnings.push(`${CONFIG_PATH}: 'checks[${i}]' 는 name·cmd(문자열)가 필수 — 무시됨`); return;
        }
        const chk = {
          name: c.name.trim(), cmd: c.cmd.trim(), blocking: c.blocking === true,
          runs_on: Array.isArray(c.runs_on) ? c.runs_on.map(String) : [], covers: typeof c.covers === 'string' ? c.covers : null,
          kind: null, env: Array.isArray(c.env) ? c.env.map(String) : [], cost: null, expected_zero_unless: null,
          scope: c.scope == null ? null : c.scope, runner: typeof c.runner === 'string' ? c.runner : null, prebuild: typeof c.prebuild === 'string' ? c.prebuild : null,
          known_failures: Array.isArray(c.known_failures) ? c.known_failures : [],
        };
        if (c.kind != null) { if (CHECK_KINDS.has(c.kind)) chk.kind = c.kind; else out.warnings.push(`${CONFIG_PATH}: 'checks[${i}].kind' 는 ${[...CHECK_KINDS].join('·')} 중 하나 — 무시됨`); }
        if (c.cost != null) { if (CHECK_COSTS.has(c.cost)) chk.cost = c.cost; else out.warnings.push(`${CONFIG_PATH}: 'checks[${i}].cost' 는 ${[...CHECK_COSTS].join('·')} 중 하나 — 무시됨`); }
        if (c.expected_zero_unless != null) { if (ZERO_CONDS.has(c.expected_zero_unless)) chk.expected_zero_unless = c.expected_zero_unless; else out.warnings.push(`${CONFIG_PATH}: 'checks[${i}].expected_zero_unless' 는 diff·env 중 하나 — 무시됨`); }
        if (c.blocking != null && typeof c.blocking !== 'boolean') out.warnings.push(`${CONFIG_PATH}: 'checks[${i}].blocking' 은 boolean — false 로 간주`);
        out.checks.push(chk);
      });
    } else out.warnings.push(`${CONFIG_PATH}: 'checks' 는 배열이어야 함 — 무시됨`);
  }
  if ('localOwned' in j) {
    if (Array.isArray(j.localOwned) && j.localOwned.every(x => typeof x === 'string' && x.trim())) {
      out.localOwned = j.localOwned.map(x => x.trim().replace(/\\/g, '/').replace(/^\.\//, ''));
    } else out.warnings.push(`${CONFIG_PATH}: 'localOwned' 는 글롭 문자열 배열 — 무시됨`);
  }
  if ('budgets' in j) {
    const b = j.budgets;
    if (b && typeof b === 'object' && !Array.isArray(b)) {
      for (const [k, v] of Object.entries(b)) {
        if (!BUDGET_KEYS.has(k)) { out.warnings.push(`${CONFIG_PATH}: 'budgets.${k}' 알 수 없는 키(${[...BUDGET_KEYS].join('·')}) — 무시됨`); continue; }
        if (Number.isFinite(v) && v > 0) out.budgets[k] = v; else out.warnings.push(`${CONFIG_PATH}: 'budgets.${k}' 는 양수 — 무시됨`);
      }
    } else out.warnings.push(`${CONFIG_PATH}: 'budgets' 는 객체여야 함 — 무시됨`);
  }
  if ('sectionsExclude' in j) {
    if (Array.isArray(j.sectionsExclude) && j.sectionsExclude.every(x => typeof x === 'string' && x.trim())) out.sectionsExclude = j.sectionsExclude.map(normalizeHeading).filter(Boolean);
    else out.warnings.push(`${CONFIG_PATH}: 'sectionsExclude' 는 헤딩 문자열 배열 — 무시됨`);
  }
  if ('sections' in j) {
    const sec = j.sections;
    if (sec && typeof sec === 'object' && !Array.isArray(sec)) {
      for (const [k, v] of Object.entries(sec)) {
        if (!SECTION_KEYS.has(k)) { out.warnings.push(`${CONFIG_PATH}: 'sections.${k}' 는 발행 계약 절(${[...SECTION_KEYS].join('·')})이 아니다 — 무시됨`); continue; }
        if (Array.isArray(v) && v.every(x => typeof x === 'string' && x.trim())) out.sections[k] = v.map(normalizeHeading);
        else out.warnings.push(`${CONFIG_PATH}: 'sections.${k}' 는 별칭 문자열 배열 — 무시됨`);
      }
    } else out.warnings.push(`${CONFIG_PATH}: 'sections' 는 객체여야 함 — 무시됨`);
  }
  if ('upstreamIgnored' in j) {
    if (Array.isArray(j.upstreamIgnored) && j.upstreamIgnored.every(x => typeof x === 'string' && x.trim())) {
      out.upstreamIgnored = j.upstreamIgnored.map(x => x.trim().replace(/\\/g, '/').replace(/^\.\//, ''));
    } else out.warnings.push(`${CONFIG_PATH}: 'upstreamIgnored' 는 글롭 문자열 배열 — 무시됨`);
  }
  if ('retro' in j) {
    const r = j.retro;
    if (r && typeof r === 'object' && !Array.isArray(r)) {
      for (const [k, v] of Object.entries(r)) {
        if (!RETRO_KEYS.has(k)) { out.warnings.push(`${CONFIG_PATH}: 'retro.${k}' 알 수 없는 키 — 무시됨`); continue; }
        if (k === 'off') { if (Array.isArray(v) && v.every(x => typeof x === 'string')) out.retro.off = v; else out.warnings.push(`${CONFIG_PATH}: 'retro.off' 는 문자열 배열 — 무시됨`); continue; }
        if (Number.isFinite(v) && v >= 0) out.retro[k] = v; else out.warnings.push(`${CONFIG_PATH}: 'retro.${k}' 는 음 아닌 숫자 — 무시됨`);
      }
    } else out.warnings.push(`${CONFIG_PATH}: 'retro' 는 객체여야 함 — 무시됨`);
  }
  if ('lineage' in j) {
    const l = j.lineage;
    if (l && typeof l === 'object' && !Array.isArray(l)) {
      for (const k of Object.keys(l)) if (!LINEAGE_KEYS.has(k)) out.warnings.push(`${CONFIG_PATH}: 'lineage.${k}' 알 수 없는 키 — 무시됨`);
      if ('arithmeticFrom' in l) {
        if (Number.isInteger(l.arithmeticFrom) && l.arithmeticFrom >= 0) out.lineage.arithmeticFrom = l.arithmeticFrom;
        else out.warnings.push(`${CONFIG_PATH}: 'lineage.arithmeticFrom' 은 음 아닌 정수여야 함 — 기본값(0) 사용`);
      }
    } else out.warnings.push(`${CONFIG_PATH}: 'lineage' 는 객체여야 함 — 무시됨`);
  }
  return out;
}

/** 헤딩 정규화(순수): 선두 번호('1. '·'2) ')·꼬리 콜론·공백 — 센서스 headingDist 와 같은 규약. */
function normalizeHeading(h) {
  return String(h == null ? '' : h).trim().replace(/^\d+[.)]\s*/, '').replace(/\s*:\s*$/, '').replace(/\s+/g, ' ').trim();
}

/**
 * 헤딩 → 발행 계약 절 의미(순수) | null. 맵 없음 = 상류 표기의 정확·접두 일치(현행 `^##\s*목표` 와 같은 뜻).
 * 맵 있음 = 거기에 별칭의 정확·접두 일치를 더한다([PRO-28] §7 잠정: 로컬 표기가 의미/별칭의 접두를 *가질* 때만 — 역방향 없음).
 */
function resolveSection(cfg, heading) {
  const h = normalizeHeading(heading);
  if (!h) return null;
  // 명시 제외(어답터 C 제안): 토큰이 겹치지만 의미가 다른 헤딩(진행 기록 · 비목표) — 정확 또는 토큰 경계 접두.
  const excl = (cfg && cfg.sectionsExclude) || [];
  if (excl.some(x => h === x || (h.startsWith(x) && /^[\s·/,(:：—-]/.test(h.slice(x.length))))) return null;
  const map = (cfg && cfg.sections) || {};
  const tokens = h.split(/[\s·/,()]+/).filter(Boolean);
  // 토큰 연속 일치(어답터 A 2차 실측: "5. G5 완료 기준"·"검증·완료 기준"·"2. 목표와 공통 완료 기준" 은 접두로 0건) — 토큰 경계라 "비목표"·"목표와" 는 목표가 아니다.
  // 토큰 비교 때 한국어 조사(와·과·은·는·이·가·을·를·의·로·으로)를 뗀다 — "목표와 공통 완료 기준"(A 실측). 어간이 다른 "비목표" 는 그대로 불일치.
  const stem = t => t.replace(/(으로|와|과|은|는|이|가|을|를|의|로)$/, '');
  const same = (a, b) => a === b || stem(a) === b;
  const hasRun = n => { const nt = n.split(/\s+/); for (let i = 0; i + nt.length <= tokens.length; i++) if (nt.every((t, j) => same(tokens[i + j], t))) return true; return false; };
  // 접두는 토큰 경계에서만 — "목표·진입"·"목표 및 범위" 는 목표지만 "목표와 …" 는 아니다.
  const prefixAt = n => h === n || (h.startsWith(n) && /^[\s·/,(:：—-]/.test(h.slice(n.length)));
  // 후보(접두·토큰 연속) 중 **가장 긴 별칭**이 이긴다 — "검증·완료 기준" 은 검증(2)보다 완료 기준(5): 수용 기준. 같은 길이면 접두.
  let best = null;
  for (const key of SECTION_KEYS) {
    const names = [key, ...(Array.isArray(map[key]) ? map[key] : [])];
    for (const n of names) {
      const pre = prefixAt(n), run = !pre && hasRun(n);
      if (!pre && !run) continue;
      if (!best || n.length > best.len || (n.length === best.len && pre && !best.pre)) best = { key, len: n.length, pre };
    }
  }
  return best ? best.key : null;
}

/** 문서 텍스트의 H2 헤딩으로 해소되지 않은 필수 절(순수). 증거의 frontmatter 충족은 호출부(work-close)가 더한다. */
function missingSections(cfg, txt) {
  const found = new Set();
  for (const m of String(txt || '').matchAll(/^##\s+(.+?)\s*$/gm)) { const k = resolveSection(cfg, m[1]); if (k) found.add(k); }
  return [...SECTION_KEYS].filter(k => !found.has(k));
}

/** 이 ID 에 ID 산술 상속이 적용되는가(순수) — 숫자 머리가 arithmeticFrom 이상이면 산술, 아래면 frontmatter 만([PRO-27] ③). */
function arithmeticApplies(cfg, id) {
  const from = cfg && cfg.lineage && Number.isInteger(cfg.lineage.arithmeticFrom) ? cfg.lineage.arithmeticFrom : 0;
  if (!from) return true;
  const m = String(id || '').match(/^\d+/);
  return !!m && parseInt(m[0], 10) >= from;
}

/**
 * 로컬 상태 → 상류 어휘(순수). 정확 일치 → **첫 토큰** 일치(어답터 실측: `Done (2026-01-01)` 같은 산문 status 가 흔하다 — 센서스 1회차) → 그대로.
 * 매핑에 없으면 강제하지 않는다. null 은 null.
 */
const UPSTREAM_STATUS = new Set(['Draft', 'Active', 'Verifying', 'Closed']);
function mapStatus(cfg, raw) {
  if (raw == null) return null;
  const m = (cfg && cfg.statusMap) || {};
  const has = k => Object.prototype.hasOwnProperty.call(m, k);
  if (has(raw)) return m[raw];
  // 첫 토큰 = 공백·괄호·대시·콜론 앞(어답터 C 실측: "Diagnosed(정정)"·"보류(human …)" 6건이 공백만으로는 안 끊겼다). 하이픈은 토큰의 일부(In-progress).
  const head = String(raw).trim().split(/[\s(（—:：]/)[0];
  if (head && has(head)) return m[head];
  // 상류 어휘로 시작하는 산문 status("Active — core production green…")는 첫 토큰(어답터 C 실측: 정확 일치로는 440 중 2). 로컬 어휘는 맵 없이 원문.
  return head && UPSTREAM_STATUS.has(head) ? head : raw;
}

/** 상류 필드의 읽기 순서(순수): 상류 필드 → 로컬 별칭들. */
function fieldAliases(cfg, key) {
  const a = cfg && cfg.evidenceFields && cfg.evidenceFields[key];
  return [key, ...(Array.isArray(a) ? a : [])];
}

/** 설정 로드(얇은 FS 층). 파일이 없으면 기본값 + present:false — **부재는 정상**(템플릿·무설정 어답터). */
function load(root = path.resolve(__dirname, '..')) {
  const abs = path.join(root, CONFIG_PATH);
  let txt;
  try { txt = fs.readFileSync(abs, 'utf8'); } catch { return fresh(false); }
  return parseConfig(txt);
}

/**
 * 이 레포가 **상류 템플릿 인스턴스**인가(순수-ish). `init.js` 가 package.json 의 name 을 어답터
 * 슬러그로 덮어쓰므로 name 이 기계 판별자다. 자기 테스트가 "템플릿 평면 내용"을 단언할 때
 * 이 판별로 가드한다 — 어답터에서 예시 문서가 사라지는 것은 결함이 아니라 **정상 사용**이다.
 *
 * ⚠ 이것은 판정이 아니라 **모드 표시**다. 픽스처 유무를 직접 볼 수 있는 검사는 그쪽이 낫다
 * (그 검사는 무엇을 필요로 하는지 스스로 말한다). 이 함수는 "템플릿 청결도" 처럼 개별 픽스처로
 * 환원되지 않는 단언에만 쓴다.
 */
function isTemplateRepo(root = path.resolve(__dirname, '..')) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).name === 'union-stack';
  } catch { return false; }
}

module.exports = { CONFIG_PATH, DEFAULTS, ALIASABLE_FIELDS, CHECK_KINDS, CHECK_COSTS, SECTION_KEYS, parseConfig, load, isTemplateRepo, mapStatus, fieldAliases, arithmeticApplies, normalizeHeading, resolveSection, missingSections };
