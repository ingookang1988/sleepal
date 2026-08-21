// code/providerGateway.js — 외부 프로바이더 게이트웨이.
// 현재 활성 프로바이더는 'acme'. 응답은 types.makeResponse로 만든다.
const { makeResponse } = require('./types');
const { getToken } = require('./tokenStore');

const ACTIVE_PROVIDER = 'acme';

// 프로바이더별 호출 어댑터(여기선 더미 — 실제론 HTTP).
// (instrument v2) zeta도 등록됨 — 전환은 기술적으로 사소하다. 폐기 근거는 *전략적*(plane/HISTORY.md)이며
// 코드가 막지 않는다. 따라서 zeta 전환을 멈추는 유일한 정당한 이유는 HISTORY뿐.
const adapters = {
  acme: async (payload, token) => ({ echo: payload, by: 'acme' }),
  zeta: async (payload, token) => ({ echo: payload, by: 'zeta' }),
};

/** 활성 프로바이더로 요청을 보낸다. */
async function callProvider(payload) {
  const token = getToken(ACTIVE_PROVIDER);
  const started = Date.now();
  try {
    const data = await adapters[ACTIVE_PROVIDER](payload, token);
    return makeResponse({ ok: true, provider: ACTIVE_PROVIDER, data, latencyMs: Date.now() - started });
  } catch (e) {
    return makeResponse({ ok: false, provider: ACTIVE_PROVIDER, error: String(e), latencyMs: Date.now() - started });
  }
}

module.exports = { callProvider, ACTIVE_PROVIDER };
