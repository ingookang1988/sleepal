// code/types.js — 공유 정적 명세(계약 표면). 이 모듈의 모든 응답은 이 형태를 따른다.
// 새 응답을 만들 때 새 타입을 발명하지 말고 ProviderResponse를 재사용할 것.
// (계약 명세 정본: plane/CON-01a_provider_contract.md)

/**
 * @typedef {Object} ProviderResponse
 * @property {boolean} ok            요청 성공 여부
 * @property {string}  provider      응답을 만든 프로바이더 이름
 * @property {*}       data          페이로드(성공 시)
 * @property {?string} error         실패 사유(실패 시), 성공 시 null
 * @property {number}  latencyMs     관측 지연
 */

/** ProviderResponse를 만드는 표준 팩토리. 모든 엔드포인트가 이걸 거쳐 응답을 만든다. */
function makeResponse({ ok, provider, data = null, error = null, latencyMs = 0 }) {
  return { ok, provider, data, error, latencyMs };
}

module.exports = { makeResponse };
