// scripts/census_round.js
// census 최신 회차 판독기 — 상류 이탈 알림 고리의 표면·트리거([PRO-29] ②(c)(d), [WO-29a-6])가 같이 쓴다.
// adopter-census(상류 전용, 배송 안 됨)를 require 하지 않는다: 이 파일을 쓰는 health·handoff-linter·dashboard 는 어답터에 배송된다.
// 어답터에는 eval/private/census/ 가 없으므로 모든 함수가 null/"회차 없음"으로 끝난다(회귀 0).
// 읽기 전용 · 원자료의 경로·상세는 결과에 싣지 않는다(레이블 · 이탈 키 · 개수만, [ADR-11]).
const fs = require('fs');
const path = require('path');

const RAW_DIR = 'eval/private/census';
const STALE_DAYS = 7; // 마지막 회차가 이보다 오래되면 health 가 회차를 묻는다([PRO-29] §7-3 잠정)

/** 최신 회차: 레이블별 가장 늦은 원자료의 델타. 원자료 없음 = null. */
function latestRound(root) {
  let files = [];
  try { files = fs.readdirSync(path.join(root, RAW_DIR)).filter(f => /^\d{4}-\d{2}-\d{2}_.+\.json$/.test(f)).sort(); } catch { return null; }
  const byLabel = new Map();
  for (const f of files) {
    const m = f.match(/^(\d{4}-\d{2}-\d{2})_(.+)\.json$/);
    let raw;
    try { raw = JSON.parse(fs.readFileSync(path.join(root, RAW_DIR, f), 'utf8')); } catch { continue; }
    byLabel.set(m[2], { label: m[2], date: m[1], delta: raw && raw.delta ? raw.delta : null });
  }
  if (!byLabel.size) return null;
  const rows = [...byLabel.values()].sort((a, b) => a.label.localeCompare(b.label));
  return { date: rows.reduce((d, r) => (r.date > d ? r.date : d), ''), rows: rows.map(({ label, delta }) => (delta ? { label, delta } : { label })) };
}

/** 신규 이탈 합계(순수). */
function newCount(round) {
  return round ? round.rows.reduce((n, r) => n + (r.delta ? r.delta.new.length : 0), 0) : 0;
}

/** 상류 HANDOFF §4 에 붙일 한 줄(순수). */
function handoffLine(round) {
  if (!round) return '어답터 census 회차 없음 — node scripts/adopter-census.js --delta --write';
  const n = newCount(round);
  const first = round.rows.some(r => r.delta && r.delta.first);
  const parts = round.rows.filter(r => r.delta && r.delta.new.length).map(r => `${r.label} ${r.delta.new.join(' · ')}`);
  return `어답터 이탈 신규 ${n} (census ${round.date}${first ? ' · 첫 회차 포함' : ''})${parts.length ? ' — ' + parts.join(' · ') : ''}`;
}

/** 날짜 차(일, 순수). */
function daysSince(date, today) {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000);
}

module.exports = { latestRound, newCount, handoffLine, daysSince, RAW_DIR, STALE_DAYS };
