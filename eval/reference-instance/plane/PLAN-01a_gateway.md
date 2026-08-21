<!-- 레퍼런스 인스턴스용 계획(example). 01a 계보를 묶는 부모 맥락. -->
# [PLAN-01a] Provider 게이트웨이

`code/providerGateway.js`가 외부 프로바이더를 단일 진입점으로 감싼다. 토큰 경로는 `code/tokenStore.js`,
응답 형태는 `[CON-01a]` 계약을 따른다. 같은 계보 경고: `[LSN-01a]`. 전략 분기점: `HISTORY.md`.

- 활성 프로바이더: `acme` (HISTORY 2026-03-02 결정).
- 작업은 `WO-01a-*` 단말로 들어온다 — 진입 시 이 PLAN + CON-01a + LSN-01a를 Upward Fetching으로 끌어온다.
