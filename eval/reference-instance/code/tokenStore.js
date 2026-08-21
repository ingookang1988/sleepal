// code/tokenStore.js — 액세스 토큰 보관/조회.

const _store = new Map(); // key -> { value, expiresAt(ms epoch) }

/** 토큰 저장. ttlMs 후 만료. */
function setToken(key, value, ttlMs) {
  _store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/** 토큰이 만료됐는지 반환. */
function isExpired(key) {
  const t = _store.get(key);
  if (!t) return true;
  return Date.now() >= t.expiresAt;
}

/** 토큰 원값 조회(없으면 null). */
function getToken(key) {
  const t = _store.get(key);
  return t ? t.value : null;
}

module.exports = { setToken, isExpired, getToken };
