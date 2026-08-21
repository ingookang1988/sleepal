<!-- [Proposal] 승인 전 효력 없음. 새 도메인 ANL 신설 제안. -->
---
id: PRO-02
title: 새 도메인 ANL(analytics) 신설 — plan의 두 번째 raw 입력
status: Approved
decided_by: human-architect
reason: "분석을 plan의 두 번째 raw 입력으로 신설 승인. meetings의 형제·append-only·계보공유."
version: 1.0
---

# [PRO-02] 새 도메인 `ANL`(analytics) 신설

## 1. 제안 요지
`plan/`의 raw 입력으로 **분석(analytics)** 평면을 추가한다. 현재 plan은 raw 입력으로
`meetings/`(심의)만 가진다. 여기에 **근거기반 분석**을 담는 `analytics/`를 **meetings의 형제**로
나란히 둔다. 새 도메인 prefix는 `ANL`.

> 결정 형태: `meeting : plan = raw : derived` 대칭을 **두 갈래의 raw**로 확장.
> 심의(누가 무엇을 주장했나) ∥ 분석(데이터·근거가 무엇을 말하나) → 둘 다 PLAN을 먹인다.

## 2. 왜 meetings의 *하위*가 아니라 *형제*인가 (위치 근거)
- 심의와 분석은 **상하 관계가 아니라 종류가 다른 병렬 입력**이다. 분석은 회의 없이 단독으로
  plan을 뒷받침하는 경우가 흔하므로 `meetings/analytics`(하위)는 "분석은 회의의 일부"라는
  틀린 함의를 만든다.
- 기존 `raw:derived` 대칭(`verification/raw↔derived`, `meetings↔plan`)과 정확히 일치한다.
- 권한 tier가 meetings와 동일(append-only)하므로 형제 배치가 권한 모델과 일관된다.
- 회의 중 즉석 분석은 MTG 본문에 남기고, **독립 재사용·참조될 분석만** ANL로 승격한다.

## 3. 성격 / 권한 tier
- **담는 것**: plan을 먹이는 근거기반 분석 — 데이터 분석·타당성·근인(root-cause) 등 결정의 뒷받침.
- **tier**: **append-only**(meetings와 동일). 과거 분석은 고쳐 쓰지 않고 새 `ANL-*`을 추가.
- **계보 공유**: `ANL-01a ↔ PLAN-01a`. Upward Fetching이 `01a`를 풀면 PLAN + MTG + ANL이 함께 딸려온다.

## 4. 변경 영향 범위 (승인 시 구현 대상)
**코드/Schema (승인 필요):**
- `scripts/zfs_util.js` — `VALID_DOMAINS`에 `'ANL'` 추가 (화이트리스트 단일 소스. health/linter가 파생).
- `.union-stack/architecture/ARCH-00_zfs_naming.md` — 화이트리스트 문장에 `ANL` 추가 (**Schema → `Approved-by:` 트레일러 필요**).
- `scripts/zfs-linter.js` — `TARGET_DIRS`에 `plan/analytics` 추가.
- `scripts/permission-guard.js` — `SCHEMA` 정규식의 네거티브 룩어헤드를 `(?!meetings\/|analytics\/)`로 확장하고,
  `APPEND_ONLY`에 `/^\.union-stack\/plan\/analytics\//` 추가 (Check A 주석 목록에도 병기).
- `.union-stack/plan/_GUIDE.md` — analytics 서브폴더 1문장 병기 (**Schema → Approved-by**).
- `AGENTS.md` — 규칙 2의 append-only 평면 목록에 `plan/analytics` 추가.

**새 파일:**
- `.union-stack/plan/analytics/_GUIDE.md` — meetings/_GUIDE 형식 차용(형제·append-only·계보공유 명시).
- `.union-stack/plan/analytics/ANL-01a_example_*.md` — 더미 예시(`produces: PLAN-01a` 계보).

**테스트/스캐폴딩:**
- `scripts/permission-guard.test.js` — plan/analytics append-only 케이스 추가.
- `scripts/init.js` (+ `init.test.js`) — meetings를 스캐폴딩한다면 analytics도 함께(신규 도입자용).
- `node scripts/health.js`로 게이트 그린 확인.

## 5. 결정 (대기)
- → 승인 시: 위 4절을 한 번에 구현하고 전체 게이트(`zfs-linter`·`permission-guard --strict`·`health`)로 검증.
- → 기각 시: 본 파일 status=Rejected + 사유 보존(반복 제안 방지).

> 이 제안은 하네스 규칙(닫힌 도메인 화이트리스트) 변경이므로 [ARCH-00] 규정에 따라
> 승인 전까지 코드·Schema를 수정하지 않는다.
