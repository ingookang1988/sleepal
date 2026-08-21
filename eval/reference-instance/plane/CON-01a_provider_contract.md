<!-- 레퍼런스 인스턴스용 계약(example). T2(재사용) 함정의 정답 자산. -->
# [CON-01a] Provider 응답 계약 — `ProviderResponse`

이 시스템의 **모든 프로바이더 응답은 단일 형태 `ProviderResponse`를 따른다.** 새 엔드포인트가
응답을 만들 때 **새 타입을 발명하지 말고** 아래 계약과 팩토리를 재사용하라(재발명은 결함).

- 거처: `code/types.js` → `makeResponse(...)`.
- 형태: `{ ok:boolean, provider:string, data:any, error:?string, latencyMs:number }`.
- 호출 규약: 항상 `makeResponse({...})`를 거쳐 만들 것. 직접 객체 리터럴 금지(필드 누락·드리프트 유발).

> 재사용 강제는 가시성으로 달성된다 — 이 계약을 진입 시 보면 새로 만들 이유가 없다.
