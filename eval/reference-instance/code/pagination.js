// code/pagination.js — 페이지네이션 응답 봉투(공유 계약). *비국소*: providerGateway와 다른 모듈.
// 목록을 반환하는 모든 곳은 이 makePage를 거친다(임의 페이지 형태 발명 금지).
// (계약 명세 정본: plane/CON-01b_pagination.md)

/**
 * @typedef {Object} Page
 * @property {Array}   items   현재 페이지 항목
 * @property {?string} cursor  다음 페이지 커서(없으면 null = 마지막)
 * @property {number}  total   전체 개수
 */

/** 표준 페이지 봉투 팩토리. 목록 응답은 전부 이걸 거친다. */
function makePage({ items = [], cursor = null, total = 0 }) {
  return { items, cursor, total };
}

module.exports = { makePage };
