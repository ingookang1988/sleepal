<!-- 레퍼런스 인스턴스용 계약(example). E1-H1 비국소성: 코드와 분리된 페이지네이션 계약. -->
# [CON-01b] 페이지네이션 봉투 계약 — `makePage`

목록(다건)을 반환하는 **모든** 응답은 단일 페이지 봉투 `Page`를 따른다. **임의의 페이지 형태를
발명하지 말고** `code/pagination.js`의 `makePage(...)`를 재사용하라(재발명은 결함).

- 거처: `code/pagination.js` → `makePage({ items, cursor, total })`. **providerGateway와 다른 모듈(비국소)**.
- 형태: `{ items:Array, cursor:?string, total:number }`. `cursor=null`이면 마지막 페이지.
- 호출 규약: 직접 객체 리터럴 금지 — 항상 `makePage(...)`를 거칠 것(필드 누락·드리프트 방지).

> 비국소 자산이므로 코드만 봐선 안 보인다. 하네스가 진입 시 이 계약을 *선주입*해야 재사용된다 —
> E1-H1이 검증하려는 바로 그 가치(가시성 = 재사용).
