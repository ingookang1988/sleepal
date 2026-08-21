<!-- 레퍼런스 인스턴스용 교훈(example). instrument v2: 순수 비국소(acme 고유 quirk) 함정. -->
# [LSN-01b] acme 토큰 region-pin 누락 (반복 3회)

**증상:** acme로 보낼 때 토큰을 *그대로* 보내 간헐 401. acme는 토큰을 호출 region에 고정(pin)된
형태로만 받는다 — 이는 acme **프로젝트 고유 quirk**로, 일반 상식으로는 추론 불가하다.
**계보:** `01a` (providerGateway 토큰 경로). 과거 3개 세션 반복.
**처방(한 줄):** acme 어댑터 호출 *전에* 반드시 `acmeProtocol.pinRegion(token, payload.region)`로
토큰을 pin한 뒤 보낼 것. `pinRegion`은 `code/acmeProtocol.js`에 이미 있다(비국소) — 새로 만들지 말고 재사용.

> 순수 비국소: `pinRegion`도, "region-pin 필요"라는 사실도 보여준 코드(providerGateway)엔 없다.
> 하네스가 진입 시 이 LSN을 선주입해야만 안다 — instrument v2가 깨끗이 측정하려는 바로 그 지식.
