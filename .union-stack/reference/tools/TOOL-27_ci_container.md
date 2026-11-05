<!-- 방법론 자산 카드(leakage-guard METHODOLOGY 등재) — 이 템플릿이 실제로 배송하는 도구. -->
---
id: TOOL-27
title: 게이트 체인 + 컨테이너 (CI 제공자 비의존 정본)
kind: cli
impl: scripts/ci.js
status: Active
version: 1.0
---

# [TOOL-27] 게이트 체인 + 컨테이너

## 용도
게이트의 **순서와 차단 정책**을 워크플로 YAML 에서 꺼내 스크립트 1벌로 만들고, 컨테이너가 그것을
돌린다. 워크플로는 **얇은 래퍼**로 남는다(체크아웃·diff 범위·증거 커밋 권한 — CI 제공자 고유 배선만).

왜: 지식이 `harness.yml` 안에 살면 그것은 **GitHub Actions 안에만** 존재한다. 어답터가 다른 CI 를
쓰거나(대개 private 레포다 — Actions 는 분당 과금이고 public 만 무료다) 로컬에서 같은 검사를 돌리려면
YAML 을 손으로 번역해야 하고, 번역본은 곧 원본과 어긋난다. **로직 2벌 = 드리프트**는 이 하네스가
`next.md`(생성 뷰)·`tools-index`(생성 블록)에서 반복해 적용한 그 원리다.

차단 정책은 [up:PRO-11] 4값 그대로 — **exit 1(REJECT)만 빌드를 깬다.** 3(CLARIFY)·4(HOLD)는 사람이
읽을 경고로 표면화하고 통과시킨다. 체인 순서는 계약이다: **싼 게이트가 먼저** 온다(네이밍 위반은
스위트를 돌릴 값어치도 없다). 차단이 걸리면 즉시 멈춘다 — 뒤 단계 출력이 원인을 덮지 않게.

| 단계 | 차단 | 비고 |
|---|---|---|
| `zfs-linter` · `history-linter` | ✔ | 싸고 결정적 |
| `permission-guard` | — | 범위(`--range`)는 래퍼가 준다 |
| `weakening-guard` | ✔ | [up:TOOL-31] — 약화 신호는 CLARIFY, **예외 목록 증가·known_failures 만료만 REJECT**([up:PRO-22] §3-4 ⓑ) |
| `handoff-linter` | — | REJECT 자체가 없다([up:PRO-13] §5) |
| `tests` · `health` · `adopter-arm` | ✔ | `adopter-arm` 은 [up:TOOL-26] |
| **선언 검사**(`adapter.json checks[]`) | 선언별 | 하네스 뒤에 어답터의 제품 검사([up:PRO-22] §3-1). **0건 검사 = 실패**(2-bis, 3분할: 차단 전수 → REJECT · 메타/diff 조건부 → NOOP_PASS · env 조건부 → CLARIFY). 선언 부재는 무기입 |

단계마다 **영수증 1줄**을 `verification/raw/receipts.md` 에 남긴다(sha · dirty · scope harness/product · name · exit · outcome · targets · passed/failed/skipped ·
reason · env · dur · gen · cmd). 러너만 쓴다 — 사람·에이전트 경로는 없다. `health` 가 차단 검사별 최신 영수증 나이를 INFO 로, `work-close` 가 evidence 의
`rcpt:` 인용을 대조한다([up:TOOL-04]·[up:TOOL-23]).

## 언제 쓰나
- **커밋·푸시 전 로컬에서** — `docker compose run --rm harness` 가 CI 와 **같은 판정**을 낸다.
  CI 를 기다렸다가 빨간불을 보는 왕복이 사라진다.
- **어답터가 Actions 를 쓰지 않을 때** — 워크플로 2개를 지우고 컨테이너만 쓴다. 게이트는 그대로 산다.
- **CI 를 옮길 때** — 새 제공자에서 할 일은 "체크아웃 후 컨테이너 한 줄"이 전부다.

## 언제 쓰지 않나
- **단위 검증** — 개별 도구의 옳음은 각 스위트가 소유한다. 체인은 *순서와 판정 합성*만 본다.
- **형상 검증** — 어답터 형상은 [up:TOOL-26] 의 몫이다. 체인은 그것을 한 단계로 부를 뿐이다.
- **증거 커밋** — Raw 평면 Append 는 쓰기 권한이 필요한 CI 배선이라 래퍼에 남았다(컨테이너 밖).
- **이미지에 레포를 굽는 용도** — Dockerfile 에 `COPY` 가 없는 것은 의도다. 레포는 **마운트**한다.
  구우면 어답터마다 이미지가 갈라지고 로컬 편집마다 재빌드가 필요해진다.

## 설계 불변식
- **컨테이너가 정본, 워크플로는 래퍼.** 워크플로를 통째로 지워도 게이트가 살아야 한다 — 이 성질이
  깨지면 지식이 다시 YAML 로 새고 있는 것이다.
- **셸 비의존.** 스위트 목록을 셸 glob(`scripts/*.test.js`)이 아니라 `readdirSync` 로 만든다 —
  ENTRYPOINT 가 `node` 라 컨테이너에 셸이 끼지 않는다.
- **어답터의 루트를 침범하지 않는다.** 파일은 `ci/Dockerfile` · `docker-compose.harness.yml` 이다 —
  어답터 루트에는 대개 **자기 앱의** Dockerfile·compose 가 있고(실측: 한 어답터의 루트 Dockerfile 은
  Railway 배포용 멀티스테이지 빌드였다), 하네스가 그 이름을 쓰면 sync 가 남의 배포를 덮어쓴다([up:ADR-46]).
  같은 이유로 빌드 컨텍스트는 `ci/` 로 좁히고 루트 `.dockerignore` 는 두지 않는다.
- **인자는 `entrypoint` 뒤에 붙는다.** compose 서비스는 스크립트 경로까지 `entrypoint` 에 박는다 —
  `docker compose run` 의 추가 인자는 `command` 를 *교체*하고 `entrypoint` 에는 *이어붙기* 때문이다.
  `command` 에 두면 `--range` 가 경로를 밀어내 `node --range` 가 된다([up:ADR-45] 실측).
- **검증은 배송 호출 형태로.** 위 결함은 로컬 검증이 인자 없이(`run --rm harness`)만 돌아서 놓쳤다.
  CI 는 `--range` 를 준다 — **CI 가 실제로 치는 명령 그대로** 돌려야 잡힌다([up:ADR-26] 의 재발).
- **알 수 없는 종료 코드는 차단.** [up:PRO-11] 4값에 없는 코드(2·5…)와 spawn 실패는 UNKNOWN → 차단이다.
  모르는 실패를 통과시키는 것이 게이트의 가장 흔한 죽는 방식이다.

## 호출
```bash
node scripts/ci.js                      # 로컬 전체 체인(호스트 node)
node scripts/ci.js --range A..B         # permission-guard 의 diff 범위
node scripts/ci.js --skip tests         # 단계 제외(쉼표 구분)
node scripts/ci.js --json
node scripts/ci.js --only-checks        # 선언 검사만(하네스 체인 생략 — 팔·디버깅)
node scripts/ci.js --no-receipts        # 영수증을 쓰지 않는 드라이런
node scripts/ci.js --scan               # package.json·훅·워크플로에서 checks[] 선언 초안(사람이 차단·비용 확정)

docker compose -f docker-compose.harness.yml run --rm harness      # 컨테이너 정본(CI 와 동일 판정)
docker compose -f docker-compose.harness.yml run --rm adopter-arm  # 형상 팔만([up:TOOL-26])
npm run ci:docker                                                 # 같은 것(별칭)
```
