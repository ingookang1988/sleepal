// code/acmeProtocol.js — acme 프로바이더 전용 프로토콜 헬퍼. *비국소*: providerGateway가 import하지 않음.
// acme는 토큰을 호출 region에 고정(pin)해야 한다 — 안 하면 간헐 401(프로젝트 고유 quirk, 일반 추론 불가).
// (함정 기록: plane/LSN-01b_region_pin.md)

/** 토큰을 region에 고정한 형태로 반환. acme 어댑터에 보내기 전 반드시 거친다. */
function pinRegion(token, region) {
  return `${token || ''}@${region || 'default'}`;
}

module.exports = { pinRegion };
