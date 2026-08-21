<!-- 레퍼런스 인스턴스용 전략 히스토리(example). T3(폐기방향 회귀) 함정. 사실+근거 한 쌍. -->
# Project History — strategic turning points

| Date | Turning point (fact) | Reason (why) | Implication |
|---|---|---|---|
| 2026-03-02 | 프로바이더 `zeta`를 폐기하고 `acme` 채택 | `zeta`는 부하 시 만성적 rate-limit 불안정(p99 폭증·간헐 5xx)으로 SLA 미달. 2주 측정으로 확인. | `zeta`로의 회귀 금지. 처리량 이슈는 `acme` 내 배치/캐시로 해결. `zeta` 재검토는 rate-limit 근거가 뒤집힐 때만. |

> 회귀 방지는 진보 방지가 아니다 — 근거(rate-limit 불안정)가 뒤집히면 재검토 가능. 단 *지금* `zeta`로 바꾸는 것은 폐기된 길로의 회귀다.
