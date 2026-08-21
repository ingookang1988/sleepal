<!-- 방법론 자산 카드(leakage-guard METHODOLOGY 등재) — 이 템플릿이 실제로 배송하는 도구. -->
---
id: TOOL-25
title: dashboard (평면 대시보드 — 관측 표면 합성)
kind: cli
impl: scripts/dashboard.js
status: Active
version: 2.4
---

# [TOOL-25] dashboard

## 용도
관측 표면을 자기완결 HTML 1장으로 **합성**한다. **개요는 전체 대시보드 그대로**이고(요약 카드·계보
트리 포함 — 축 페이지가 개요에서 정보를 *빼가지 않는다*), 축 세부 페이지는 나브 또는 요약 카드의
"자세히 →"로 **추가 진입**한다(현재 제품 · 당위(ARCH) · 스프린트 · 시간축). 새 축은 `VIEWS` 배열에
한 줄을 더해 늘리고, **어답터는 `--sections` 로 sync 파일을 고치지 않고 늘린다**(아래 확장점).

> **라우팅: CSS가 정본, JS는 해시 북마크만**([ADR-26] — 실측 2회 오수리, 근거는 impl jsdoc).
> 전환은 라디오 `:checked ~` 형제 선택자로 **스크립트 0에서 성립**하고(진입점은 전부 `<label>`),
> JS 는 북마크만 얹는다. CSS 까지 죽으면 전 뷰가 쌓여 내용은 읽힌다 — 빈 화면으로 죽지 않는다.

**개요**: 타일 4 + Health([TOOL-04]) · 예산 · 작업대([TOOL-23]) · 신선도 · 크기 헤드룸 · 효과
표면([ADR-23]) · 계약 간선([PRO-16]) · 당위 요약([PRO-04]) · 계보 트리([TOOL-24]). 각 절의 존재
이유(불리언/한 줄 텍스트가 숨기던 신호)는 impl 의 각 섹션 jsdoc 이 정본이다.

## 축 페이지 — 각 축의 "짝"이 설계 원리다 (상세: impl 의 각 뷰 jsdoc)
- **제품** — 짝: **관객**. 다른 축은 전부 하네스 관리자를 향하고 PO 의 네 질문(로드맵 대비 어디까지 ·
  뭐가 진행 중·막혔나 · 최근 배송 · 리스크)에는 답하지 않았다([ADR-33]). 원료는 이미 평면에 있다:
  진입점(HANDOFF §3) · 로드맵 진행률(PHASE exit 절) · Now/Next/검증대기(WO `status:`) · PLAN 롤업 ·
  배송(원장 + `feature/live.md`) · 리스크(잠금 + 게이트 부채 + HANDOFF §4). ⚠ **관측이지 판정 아님**
  ([PRO-11] §4) — exit 충족은 `✅` 표식 휴리스틱이고 진행률은 점수가 아니다. 그 규율의 이행 둘:
  exit 0건은 "달성"이 아니라 **기준이 없다**로, 전 단계 종료는 "후속 단계 미정"으로 적는다.
  ※ 예정 축의 **기획(PLAN) 축**과 다르다(여기는 상태 계수, 저기는 커버리지 격자) — 보류 조건 유효.
- **당위(ARCH)** — 짝: verification 첫 화살표(규범↔현실). 규범마다 절 구조 · 집행자 계약(scope=
  사각지대, [PRO-11]) · 인용처 · 집행 등급 3분. ⚠ 인용 ≠ 집행([ADR-07]) — 관측이지 판정 아님.
  게이트 계약은 정적 파싱(발견된 파일을 실행하지 않는다).
- **스프린트** — 짝: 종료 의례([PRO-15]). WO 마다 닫힘 조건(증거 3분 · closed_by 흔적 · 미충족
  사유는 work-close `checkClosure` 소비) + HANDOFF 인계 카드(5부·토큰·검증란).
- **시간축** — 짝: 격자의 두 번째 빈칸(§3.2 — 반복은 스냅샷에 안 보인다, [ADR-04]). 결정 밀도 ·
  재제안 차단([PRO-14] ⛔+재개 조건) · LSN 오답노트 · HISTORY 분기점. 파서는 소유 도구의 export
  소비(parseLedger→[TOOL-22] · parseEntries→history-linter — 중복 파서는 드리프트).

## 예정 축 (보류 — 기각 아님)
보류는 결정이며 재개 조건과 한 쌍이다 — 표본 없는 시각화는 짓지 않는다.
- **계약(CON) 축** — 재개 조건: **실계약 ≥ 3 또는 간선 ≥ 10**([PRO-16] §4와 일치). 현재 계약 2건
  (더미)·실간선 1건이라 개요 카드가 이미 전부다. 후보: 소비자 그래프 · 판별식 위반 · 잠금 이력.
- **기획(PLAN) 축** — 재개 조건: **실평면 PLAN ≥ 5**(스파이크 ②히트맵 조건 재사용). 현재 1건
  (예시)이라 그릴 격자가 없다. 후보: PLAN×(FLOW·CON·LSN·WO) 커버리지 · Crystallized 전이 상태.

## 어답터 확장점 — `--sections <module>` ([ADR-32])
이 파일은 **sync** 라, 어답터가 자기 관측을 합치는 길이 sync 포크(→ `--apply` 가 되돌림)나 HTML 2장
(합성 원칙 훼손)뿐이었다. 모듈이 `[{id, title, axis, axisLabel?, render(gathered)}]` 를 export 하면
`render`(수집 데이터 → HTML 조각, 순수)가 그 축에 얹힌다. 새 `axis` id 면 축이 하나 생긴다.
경계 셋: **카드 껍데기는 호스트가 씌운다**(구조 훼손 불가) · **실패는 그 카드에만**(전체 불사) ·
**모듈 로드 실패는 침묵 금지**(stderr + exit 1, 대시보드는 나머지로 계속). 예시: MIGRATION.md.

## 설계 불변식
- **합성이지 계산이 아니다** — 기존 export(health · context-budget · work-close · lineage-tree)를
  소비만 한다(정확한 목록은 impl 의 require 블록). `health.gather()`가 판정 외에 원자료도 내므로
  같은 수집을 두 번 하지 않는다.
- 경과일 계산의 `today`는 `gatherAll`이 주입한다 — 렌더는 순수하게 유지되고 테스트가 결정적이다.
  데이터의 옳음은 각 소스 도구의 테스트가 소유하고, 여기서는 그리기만 검증한다(로직 1벌, 표면 N개).
- 어답터 평면 무가정은 소스 도구가 이미 보장한다 — 이 도구는 그 출력을 재해석하지 않는다.
- 평면 **자유 서술**은 `prose()`(esc → 볼드·코드·행두 인용/헤딩)를 거친다 — 식별자·속성값은 `esc`
  가 정본. 모르는 문법은 원문 유지라 실패할 수 없다([ADR-35]).
- 판정 마크 색은 dataviz 예약 status 팔레트(OK 녹·FAIL 적·WARN 호박) — 계열색(도메인 칩)과
  절대 공유하지 않고, 항상 글리프+단어를 동반한다(색 단독 금지).
- 섹션 함수는 전부 순수(데이터 → HTML) · zero-dep 자기완결(인라인 CSS/JS, CDN 0).
- 산출물(`dashboard.html`)은 **gitignore** — 커밋하면 드리프트 게이트가 하나 더 는다.

## 언제 쓰나
- 세션 진입 시 낯선 평면(어답터 레포)의 건강·예산·작업대·구조를 한 번에 잡을 때.
- 세션 종료 전 게이트 FAIL·예산 초과·잠금(🔒)을 마지막으로 훑을 때.

## 언제 쓰지 않나
- **CI/커밋 게이트** — 판정은 각 린터의 exit code 가 정본이다(`--json`은 health FAIL 시 exit 1을
  중계하지만, 게이트 체인을 대체하지 않는다).
- **계보만 볼 때** — [TOOL-24] `npm run tree`.

## 호출
```bash
node scripts/dashboard.js                 # 실평면 → dashboard.html (gitignored)
node scripts/dashboard.js --out <path>    # 출력 경로 지정
node scripts/dashboard.js --json          # 수집 데이터를 JSON 으로 (health FAIL 시 exit 1)
node scripts/dashboard.js --sections scripts/dashboard.local.js  # 어답터 섹션 합성
```
