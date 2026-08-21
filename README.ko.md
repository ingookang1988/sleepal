<!--
  이 파일은 공개 템플릿의 [Schema] 계층입니다.
  방법론만 담고, 실제 프로젝트 내용은 담지 않습니다.
  모든 예시는 가공 더미(example)입니다 — 복제 후 당신의 내용으로 교체하세요.
-->

# union-stack

**🌐 [English](./README.md) · 한국어**

> AI 에이전트와 함께 **선(先)기획 · 대량(大量) 개발**을 안전하게 굴리기 위한 문서 기반 제어 평면(control plane) 템플릿.
> 코드가 아니라 *지식*을 1급 시민으로 다룬다. 마크다운 + 네이밍 규약 + 권한 경계만으로 그래프 DB 없이 작동한다.

> 이름의 유래: 흩어진 관심사(아키텍처·기획·작업·검증·학습)를 하나의 좌표계로 **통합(union)**한 문서 **스택(stack)**. 6-doc-stack → 7-doc-stack의 진화를 잇는다.

이 레포는 **빈 골격**이다. `clone` 후 더미 예시를 당신의 프로젝트 내용으로 교체하면 바로 시작할 수 있다. 채워진 내용(실제 ID 계보·테스트 케이스·교훈)은 당신의 자산이며 공개할 필요가 없다 — 공개되는 것은 이 *구조와 방법론*뿐이다.

---

## 0. 왜 이게 필요한가 (30초)

LLM 에이전트는 컨텍스트 윈도우와 추론력이 커질수록 *능력*은 커지지만 *방향성*은 저절로 생기지 않는다. 능력이 클수록 "그럴듯하게 틀린" 큰 변경을 만들기 쉽다. 그래서 구조는 약한 모델을 위한 *목발*이 아니라 강한 모델을 위한 *핸들*이다.

이 하네스가 매일 하는 일은 하나다 — **인간의 모호한 의도를 좌표계 위에 강제로 올려놓는 것.** "로그인 좀 고쳐줘"가 `[PLAN-01a1]`이라는 좌표를 갖는 순간, 에이전트의 어텐션은 닻을 내릴 곳을 얻는다. 현존하는 모든 에이전트가 트랜스포머 기반이므로, 고유 식별자로 잘 토큰화된 프로젝트는 어텐션이 날카롭게 걸린다.

> **측정됨 (v6.0 — [`eval/RESULTS.md`](./eval/RESULTS.md)).** 통제된 A/B(하네스 on vs off, 같은 모델·같은 과제)로 하나의 법칙을 확인했다: **하네스 효능은 요구 지식의 *비국소성*에 비례하고, 모델 강도와 무관하다.** 어떤 코드 스냅샷에도 없는 지식(반복된 함정·폐기된 방향·다른 모듈의 계약)에 대해 on이 off보다 **+1.0**(항상) 더 맞혔고, 이미 코드에 보이는 지식엔 효과 ≈0이었다. 결정적으로 이 효과가 haiku·Sonnet·**Opus**에서 동일했다 — 가장 센 모델조차 컨텍스트 밖은 못 본다. 이는 "약한 모델용 목발" 가설을 *반증*하고 핸들 주장을 *확증*한다. 발견은 규모에서도 정확하다(100노드 평면에서 precision=recall=1.00, 주입량은 계보 깊이에만 묶임). 주입 비용 ≈208토큰은 *실측*이지만, "회피 재작업 ≈82×"는 **모델링 추정**이다(결함 1건 = 17k토큰 재생성 가정 — [`eval/`](./eval/) 참조). 범위 한계: 이 A/B는 비국소 지식이 *필요하도록 설계된* 과제와 탐색 도구 없는 off-arm 기준이며, **운영 경화(E3 — 실작업 enforce 도그푸딩)는 미완**이다. 방법·정직한 한계: [`eval/PROTOCOL.md`](./eval/PROTOCOL.md), [`eval/CALIBRATION.md`](./eval/CALIBRATION.md).

---

## 1. 3계층 권한 모델 (가장 먼저 이해할 것)

지식을 변화 속도에 따라 세 계층으로 나누고, 권한을 **비대칭**으로 준다.

| 계층 | 무엇 | 인간 | 에이전트 |
|---|---|---|---|
| **Schema** (거의 불변) | 규범·정체성·계획·계약 | 수정 | **읽기 전용** |
| **Wiki** (자주 변함) | 살아있는 상태·작업 현황 | 목표 큐레이션 | **행 단위 원자적 쓰기** |
| **Raw** (추가만) | 검증된 사실·증거·결정 원장 | 읽기 전용 | Append만 (시스템 주도) |

여기에 v5의 **제4 계층**이 더해진다:

| **Proposal** (제안) | 하네스 규칙 변경 제안 | 승인/거부 | **쓰되 승인 전 효력 0** |

핵심 원칙은 **Fail-close**다. 규범 위반·계약 불일치·모호함이 감지되면 에이전트는 멋대로 진행하지 않고 멈춰 인간을 기다린다. 인간이 "규범을 우회하라"고 해도 거부한다.

---

## 2. 문서 지도 — 3층위로 읽기

기둥들은 평평하지 않다. 세 층위로 작동 방식이 다르다. **전부 `.union-stack/` 아래에 격리되어 산다**(제품 코드와 섞이지 않고 루트를 더럽히지 않는 격리된 컨트롤 평면).

```
.union-stack/                  ← 컨트롤 평면 전체가 여기에 격리됨
[ 액자 / 경계 + 시간축 ]   "이 프로젝트가 무엇인가" — 과거/현재/미래를 한 폴더에서
  project/
    IDENTITY (현재)   정체성·경계·도메인 어휘. 세션 시작 시 1회 주입.
    roadmap/  (미래)   마일스톤·게이트 — 어디로 가는가
    HISTORY.md (과거)  전략적 분기점(피봇·의존성 도입/폐기) — 사실+근거, 회귀 방지

[ 칸 / 기둥 ]     실제 지식을 담는 곳. 추상 레벨 × 상태/행위 격자로 배치.
                   상태(존재)              행위(변화)
  당위(불변)       architecture/               (roadmap은 project/ 하위)
  계약(약속)       contracts/  ★           plan/
  실제(관찰)       feature/                sprint/  (+ HANDOFF.md 세션 이어달리기)
  시간축(반복)     lessons/    ★           (verification의 시간축 짝)

[ 화살표 / 검증 ] 칸과 칸이 어긋났는지 재는 동적 평면 — 기둥이 아니다.
  verification/raw/       외부 신호 수신 (CI·컴파일러 생성, 에이전트 read-only)
  verification/derived/   검증 출력: gap(규범↔현실), state(구조 관찰)

[ 메타 / 자기 진화 ]
  proposals/         하네스 규칙 변경 제안 → 인간 승인/거부 → 사유 보존 (= 회고)
```

(레포 루트엔 `README.md`, `AGENTS.md`, `LICENSE`, `package.json`, `scripts/`만 남고, 나머지는 전부 `.union-stack/` 아래에 있다.)

★ = 일반적인 doc-stack에 흔히 빠져 있는 두 평면. 이 템플릿의 차별점이다.
- `.union-stack/reference/contracts/` — 공유 정적 명세(타입·인터페이스)와 **테스트 도구 카탈로그**. "에이전트가 새로 만들지 말고 찾아 쓸 것들."
- `.union-stack/reference/lessons/` — 반복된 실패의 누적(오답노트). 작업 진입 시 *사전 경고*로 주입.

> 위 두 ★평면은 `.union-stack/reference/` 아래 묶인다 — *쓰기 전에 조회하는 지식*(재사용 + 사전경고). `verification/`이 `raw/`+`derived/`를 묶는 것과 대칭. 권한 tier는 하위별 유지: `contracts`=Schema, `lessons`=Wiki. 추가 멤버 둘: `domain/`(DOM-*, 도메인 진리)과 `tools/`(TOOL-*, Wiki — 재사용 실행 자산(스크립트·스킬·MCP 도구)의 *카탈로그*. 실체는 원래 자리에 두고 `scripts/tool-linter.js`가 깨진 포인터를 Fail-close).

각 디렉터리의 `_GUIDE.md`에 "무엇을 싣고 무엇을 빼는가"가 적혀 있다.

---

## 3. ZFS 네이밍 — 그래프 없는 계보 추론

파일 이름만으로 부모·자식·형제를 역산한다. 니클라스 루만의 폴게제텔(Folgezettel)을 차용했다.

```
[DOMAIN]-[LUHMANN_ID]_[slug].md      예: PLAN-01a1_example_oauth.md
```

- **DOMAIN**: 대문자 2~6자. `scripts/zfs_util.js`의 `VALID_DOMAINS`가 강제하는 **닫힌 화이트리스트**: `ARCH INF PHASE CON PLAN MTG FLOW WO WF LSN DOM EVD ADR PRO`.
- **LUHMANN_ID**: 숫자로 시작, 숫자·알파벳 교차 확장. 알파벳에 **`l`/`o` 금지**(숫자 1·0과 혼동). 단말 작업은 끝에 `-N`.
  - `01` → `01a` → `01a1` → `WO-01a1-1`
- **slug**: 소문자 스네이크. 공백·하이픈·대문자 금지.

> 검증된 정규식과 자식/형제 판정 로직은 `scripts/`에 있고 테스트로 보증된다. 아래 두 의식은 실행 가능하다: `node scripts/upward-fetch.js <ID>`, `node scripts/blast-radius.js <ID>`. 자세한 규약은 `.union-stack/architecture/ARCH-00_zfs_naming.md`.
> **이미 Zettelkasten/Folgezettel이나 계층형 plan ID를 쓰고 있다면?** ZFS 계보와 1:1 매핑 — 변환 불필요. **기존 프로젝트 이관은?** [`MIGRATION.md`](./MIGRATION.md) 참조. **이전 union-stack에서 버전업하나요?** 버전별 변경 내역은 [`CHANGELOG.md`](./CHANGELOG.md)에 있습니다.

### 작업 진입 의식 (Upward Fetching)

에이전트가 `WO-01a1-2`를 받으면 코드 작성 **전에**:
1. ID 파싱 → 부모 역산 (`01a1` → `01a` → `01`)
2. 같은 ID의 `PLAN-*`, `FLOW-*`, `CON-*` 전역 스캔 → 워킹 메모리에 적재
3. **같은 계보의 `LSN-*`(과거 반복 실패) 확인** ← 시간축
4. 공간(부모 맥락) + 시간(과거 함정)을 모두 인지한 뒤 시작

### 세션 부트스트랩 (이어달리기)

새 세션이 시작될 때 에이전트가 읽는 순서:
1. `.union-stack/project/` — 이 프로젝트가 무엇인가 (정체성)
2. `.union-stack/sprint/HANDOFF.md` — 직전 세션이 어디서 멈췄고 무엇을 이어받을지 (이어달리기)
3. HANDOFF의 변경 위치 ID들로 Upward Fetching → 끊긴 맥락 복원

세션을 **마칠 때**는 에이전트가 `HANDOFF.md`를 갱신한다(필수 5요소: 요약·변경위치·다음작업·미해결·검증상태). 상세 규율은 `.union-stack/sprint/_GUIDE.md`.

---

## 4. 빠른 시작

```bash
# 1. 템플릿 복제
git clone <this-repo> my-project && cd my-project

# 2. 스캐폴딩 — 정체성 시딩·더미 제거·매니페스트 초기화 (미리보기 후 적용)
node scripts/init.js --name "My Project"            # dry-run: 계획만 출력
node scripts/init.js --name "My Project" --apply    # 적용 (--drop-template-bits 추가 시 템플릿 전용 자산까지 제거)

# 3. IDENTITY의 TODO를 채우고, .union-stack/architecture/ 에 아키텍처 규범을,
#    .union-stack/plan/ 에 첫 기획을 작성

# 4. 네이밍 린터로 검증
node scripts/zfs-linter.js
```

> 기획 전에 탐색이 필요하면? **`.union-stack/spike/`** 샌드박스를 쓰라 — ZFS 네이밍·의례 없이 자유롭게, 휘발성. 각 스파이크는 세 출구 중 하나로 종료(plan 승격 / lesson 증류 / 폐기). 상세는 `.union-stack/spike/_GUIDE.md`.

**런타임 질의 표면 (읽기 전용).** **의존성 0 MCP 서버**(`scripts/mcp-server.js`, `.mcp.json`로 등록)로 에이전트가 plane을 런타임에 질의한다: `upward_fetch`·`blast_radius`·`where_to_record`·`zfs_lint`·`list_docs`. Claude Code엔 슬래시 커맨드(`/upward-fetch` 등)도 제공. *읽기*만 노출 — 쓰기는 거버넌스가 적용되는 파일 편집 경로 유지. (다른 도구는 같은 서버를 가리키면 됨; Cursor는 `.cursor/mcp.json`.)

**런타임 강제 (opt-in).** 위 린터들은 *사후*(커밋/CI)에 돈다. 나쁜 편집을 *착륙 전에* 막는 *사전* 강제를 위해, 두 훅 어댑터가 에이전트 행동 직전에 의례를 적용한다: `PreToolUse` 훅(`scripts/hook-pretool.js`)은 Schema 계층 파일 편집과 **blast-radius**에 `Verifying`/`Live` 노드가 걸린 편집을 거부하고, `UserPromptSubmit` 훅(`scripts/hook-userprompt.js`)은 작업 ID가 보이면 **Upward Fetching을 자동 주입**(부모 맥락 + 같은 계보 함정)한다. 명령을 실행하므로 직접 켠다 — [`scripts/HOOKS.md`](./scripts/HOOKS.md)의 스니펫을 `.claude/settings.json`에 복사. 모드는 `UNION_STACK_HOOK=warn`(기본) `| enforce | off`. 로직은 tool-agnostic이라 어떤 도구의 pre-edit / prompt 훅이든 같은 두 스크립트를 가리키면 된다.

**자가 점검·증거.** `node scripts/health.js`는 게이트 상태+구조 지표(실행형 조견표), `node scripts/eval.js`는 하네스 *레버리지*와 예측 효능(캘리브레이션 모델), `node scripts/context-budget.js`는 부트스트랩 주입을 가볍게 유지한다. 가치 주장을 *측정된 결과*로 바꾼 통제 A/B(정직한 한계 포함)는 [`eval/`](./eval/)에 있다: 방법 [`eval/PROTOCOL.md`](./eval/PROTOCOL.md), 결과 [`eval/RESULTS.md`](./eval/RESULTS.md), 프록시↔효능 모델 [`eval/CALIBRATION.md`](./eval/CALIBRATION.md).

AI 에이전트는 레포 루트의 **`AGENTS.md`**를 자동으로 읽는다(범용 표준). 이 파일이 결정론적 규율을 못 박고 `.union-stack/`으로 안내한다. 자기 전용 파일만 읽는 도구를 위해 한 줄 스텁(예: `CLAUDE.md`)이 `AGENTS.md`를 가리킨다 — 진실의 출처는 하나로 두고 규칙을 중복시키지 않는다.

각 디렉터리의 `_GUIDE.md`에서 상세를 확인하라.

---

## 5. 공개/소유 경계 (이 템플릿을 쓰는 당신에게)

이 레포는 **틀**만 공개한다. 당신이 복제 후 채우는 **내용**은 당신의 자산이다.

- 공개해도 되는 것(틀): 디렉터리 구조, 네이밍 규약, 가이드, 스크립트, 가공 예시.
- 소유할 것(내용): 실제 ID 계보, 실제 테스트 케이스, 실제 오답노트, 실제 데이터 리니지.

**누설 주의:** 예시를 당신 도메인으로 너무 구체적으로 바꾼 채 공개 포크를 만들면 도메인이 샌다. 공개용은 항상 `example` 더미를 유지하라.

**누설 가드 (공개 템플릿/공개 포크용).** `node scripts/leakage-guard.js` 는 `.union-stack/` 아래 콘텐츠 파일이 더미 마커(`example`/`dummy`/`예시`/`더미`)도 없고 allowlist 방법론 파일도 아니면 Fail-close 한다. 이는 *"정화를 깜빡함"을 잡는 트립와이어*이지 내용을 이해하는 도구가 아니다 — 마커만 있으면 통과하므로 우회 가능하다. CI 게이팅은 `.github/workflows/template-guard.yml` 에 있고 repo variable `TEMPLATE_MODE=true` 일 때만 실행되어, 실제 프로젝트 클론에서는 비활성으로 남는다. 켜기: 레포 Settings → Actions → Variables → `TEMPLATE_MODE=true`. 실제 프로젝트라면 변수를 두지 말 것(또는 워크플로와 `scripts/leakage-guard.js` 삭제).

---

## 6. 라이선스 · 기여

방법론 템플릿으로서 공개된다. 구조 개선 제안은 이슈/PR로 — 이것이 곧 이 하네스의 *외부화된 제안 계층*이다. 당신의 사적 프로젝트 내용은 절대 PR에 포함하지 말 것.

> 이 템플릿의 설계 근거 전문은 `DESIGN_RATIONALE.md` 참조.
