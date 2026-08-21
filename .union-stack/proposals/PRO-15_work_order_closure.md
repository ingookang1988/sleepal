<!-- [Proposal] 승인 전 효력 없음. WO 정본화 + 종료 의례 + 수명주기 어휘 통일. ID·필드값은 가공 예시(example) — 상한·최소요구는 승인 시 확정. -->
---
id: PRO-15
title: 작업 지시(WO) 정본화와 종료 의례 — 진입 의례의 거울
status: Approved
decided_by: ingookang1988 (chat approval, 2026-08-18)
reason: "§12 다섯 항목 일괄 승인. ①상한 1,500 tok ②닫힘=흔적1+증거1(none — 이유 허용) ③Live 제거 ④Closed WO 이동은 **세션 종료 시**(배치 — 중간 이동은 diff만 어지럽힌다) ⑤next.md 기존 수기 표는 폐기하고 생성 뷰로 전환. 구현·검증 완료([ADR-21])."
version: 1.0
---

# [PRO-15] WO 정본화와 종료 의례

## 1. 요지
이 하네스에는 **진입 의례가 3중**(`upward-fetch`·`check-prereqs`·`blast-radius`)인데 **종료 의례가 0**이다.
AGENTS.md에도 "Work-entry ritual"만 있고 exit이 없으며, `scripts/`에 close·complete·finish 계열이 없다.
그 결과 WO는 시작될 수는 있어도 **닫힐 수 없다**.

제안은 세 축의 하이브리드다 — ⑴ WO를 **문서로 정본화**(상태·추적성), ⑵ `sprint/next.md`를 그 문서들의
**생성 뷰**로 전환(중복 제거), ⑶ **`work-close` 종료 의례** 신설(상위 축 흔적·증거 표면화).
그리고 이 과정에서 갈라져 있던 **수명주기 어휘를 통일**한다.

## 2. 병인 (실측)

| 관측 | 사실 |
|---|---|
| WO 도메인 문서 수 | **0건** — 화이트리스트에는 있으나 실체가 `next.md`의 표 행뿐 |
| `next.md`의 `State` 열 | 값의 **어휘가 어디에도 정의되지 않음** (현재 `(더미)`) |
| WO의 상태 판독 | 표 행에는 frontmatter가 없다 → `zfs_index`가 못 읽음 → `blast-radius`가 못 잠금 |
| `Verifying`/`Live` 상태 노드 | 50노드 중 **0건** — 잠금이 한 번도 발동한 적 없음 |
| `Live`의 정의 | **없음.** 코드(`query.js`의 `LOCKED`)만 잠그고 어느 가이드에도 정의가 없다 |
| 상위 축 반영 대상 | 후보 5곳인데 무엇이 필수/선택인지 **미명시** |

### 2.1 결정적 병목 — 수명주기가 원리적으로 완결 불가였다
`plan/_GUIDE`는 이렇게 쓴다:

> Crystallized는 즉시 삭제가 아니다. **계보의 모든 후속이 terminal이고** grace period가 지나야
> GC가 결정을 원장으로 결정화하고 plan을 제거한다.

GC 조건이 **후속(=WO)의 terminal 여부**에 의존하는데 WO에는 상태가 없다. 판정 불가 → `PLAN`은
영원히 `Crystallized`에 닿지 못한다. 실제로 `PLAN-01`은 아직 `Draft`다.

> **선행 결함은 이미 수리됐다([ADR-20]).** 계보 판정이 양방향으로 어긋나 단말 WO가 `blast-radius`·GC·
> 플릿 파티션에서 통째로 누락되고 있었다. 그 수리 전에는 본 제안이 성립하지 않았다.

## 3. 하이브리드 — 상태를 두 곳에 두지 않는다

`plan/_GUIDE`가 이미 못 박은 원칙이 그대로 적용된다 — *"수명주기를 디렉터리에도 인코딩하지 마라
(사실 중복 → 드리프트)"*. WO 상태를 문서와 표에 **둘 다** 두면 반드시 어긋난다. 따라서:

```text
[A] sprint/WO-01a-1_slug.md            ← 정본. frontmatter status. 도구가 읽는 유일한 출처
        │  work-close --table (컴파일)
        ▼
[B] sprint/next.md  <!-- worktable:begin/end -->   ← 파생 뷰. 활성 WO만. 손 편집 금지
        │  work-close <WO-ID> (역방향 의례)
        ▼
[C] 상위 축 흔적 — feature/live.md · verification/derived/{state,gap}.md · CON-* · 부모 PLAN
```

**효과: 종료 시 행 제거가 절차가 아니라 부수효과가 된다.** WO를 `Closed`로 바꾸면 뷰에서 저절로
빠지므로 "행 지우는 걸 잊었다"가 구조적으로 불가능하다. 이 형태는 `tools-index`·`blocks-index`가
이미 쓰는 컴파일 패턴이며 새 원리가 아니다.

## 4. WO 문서 계약 (경량 유지 장치)

가공 예시(example):

```yaml
---
id: WO-01a-1
title: (예시) 인증 게이트웨이 배선
status: Draft            # Draft | Active | Verifying | Closed
parent: PLAN-01a         # ID에서 역산 가능하나 명시하면 읽기 쉽다
evidence: "none — 아직"   # 값 또는 `none — 이유`. **빈 값 금지**
closed_by: []            # 상위 축 흔적(파일 경로). 닫을 때 채운다
version: 1.0
---
## 목표
## 수용 기준
## 증거
```

- **필수 요소 4**: `## 목표` · `## 수용 기준` · `## 증거` 3절 + frontmatter `parent`.
  `smell-linter`가 TOOL 카드에 쓰는 해부 검사와 같은 방식.
- **상한 1,500 tok** — 시나리오 본문·HANDOFF와 **같은 quantum**(세 번째 숫자를 만들 근거가 없다).
  근거는 주입량이 아니라 [PRO-13]의 원리다: *예산 초과는 용량 문제가 아니라 라우팅 실패의 증상*.
  넘치면 결정→원장, 함정→lessons, 계약→CON, 과정 서사→버린다(git이 갖고 있다).
- **상한의 이중 역할**: WO가 상한에 습관적으로 근접하면 **문서가 큰 게 아니라 작업이 큰 것**이다.
  문서를 줄이지 말고 WO를 쪼개라.

## 5. 닫힘의 정의 — 선언이 아니라 확인 가능한 사실 둘

1. **상위 축 흔적 ≥ 1곳** (`closed_by:`) — 그리고 그 파일에 **실제로 이 계보 참조가 있는지** 도구가 확인한다.
   선언만 하고 반영하지 않은 경우가 탐지된다.
2. **증거 명시** (`evidence:`) — 테스트·artifact·`raw/evidence.md` 항목, **또는 `none — 이유`**.

②의 근거는 `smell-linter`의 기존 판정을 다른 도메인에 옮긴 것이다:

> `unevidenced-active`: `status: Active`인데 `evidence[]`가 빔 → 근거 없이 승격 불가

그리고 "모든 작업이 실행 증거를 낳지는 않는다"는 [PRO-13]의 해법을 재사용한다 —
*빈 부는 `— 해당 없음`을 명시*. **미기입과 해당없음의 구별**이 이 요구의 전부이며, 차단은 없다.

> **흔적만으로 부족한 이유**: 흔적은 *어디에 반영했나*, 증거는 *정말 됐나*로 서로 다른 질문이다.
> 흔적만 요구하면 "live.md에 한 줄 적었으니 닫힘"이 성립하는데 그것은 자기 선언과 같다.

## 6. `work-close` — 진입 의례의 거울 (신규 [TOOL-23])

```bash
node scripts/work-close.js <WO-ID>     # 닫힘 점검: 0(충족) / 3(CLARIFY, 비차단)
node scripts/work-close.js --table     # next.md 작업대 뷰 재생성
node scripts/work-close.js <ID> --json --contract
```

동작: `ancestorChain`으로 부모 축을 산출([ADR-20] 수리로 `blast-radius`와 답이 일치한다) → 아래를 판정.

| 검사 | 판정 |
|---|---|
| `closed_by:` 비었음 | CLARIFY — 갱신 후보 5곳을 제시 |
| `closed_by:`가 가리킨 파일에 계보 참조 없음 | CLARIFY — **선언만 하고 반영 안 함** |
| `evidence:` 빈 값 | CLARIFY (`none — 이유`는 통과) |
| 부모 PLAN의 자식 WO가 **전부** Closed | 정보 — PLAN status 전이 **후보 제시**(강제 전이 없음) |

로직 1벌·표면 2개(점검 / 작업대 컴파일)로 스크립트는 하나만 늘린다.

## 7. 수명주기 어휘 통일 + `Live` 제거

```text
WO   : Draft → Active → Verifying → Closed
PLAN : Draft → Active → Verifying → Crystallized     (기존 유지)
LOCKED = { Verifying }                                (Live 제거)
```

`Live`를 **정의하지 않고 제거**하는 근거:

- **필요가 입증되지 않았다** — `Verifying`/`Live` 상태 노드가 실측 0건. 잠금이 필요했던 적이 없다.
- [ADR-08]의 기준: *강제력↑ → 마찰↑, 비용은 매 세션 인간이 낸다.* 아무도 요청하지 않은 잠금을
  새로 정의하는 것은 이 기준을 통과하지 못한다. [ADR-12]의 "제거 기계" 규율과도 어긋난다.
- 실제 용도(플릿 침범 방지 — [PRO-05])는 `Verifying` 하나로 충분하다.
- **현 상태가 최악이다**: 코드는 잠그는데 정의도 색인 경로도 없어 **영원히 발동하지 않는 안전장치**다.
  있다고 믿는 것이 없는 것보다 위험하다.

제거 범위: 문서 8곳의 `Verifying/Live` 표기 → `Verifying`. 그중 `ARCH-00`만 [GRANT-02] 밖이라 별도 승인 필요.
되돌릴 조건은 `blocks:`/`reopen_when:`([PRO-14])로 남긴다 — "운영 산출물을 보호해야 했는데 못 한 사례가
실제로 나올 때".

> **범위 밖(의도적 유보)**: `feature/live.md`의 `Status` 열 어휘도 미정의지만 본 제안은 손대지 않는다.
> `work-close`는 그 열의 *값*이 아니라 **행의 존재**만 보므로 지금 정의할 필요가 없다.

## 8. Closed WO의 거처 — 삭제하지 않는다
추적성 보존이 목적이므로 Closed WO는 **남긴다**. `sprint/` 루트는 활성만 두고 Closed는
`sprint/archived/`로 옮긴다 — `plan/archived/`가 이미 쓰는 *"일방향 비활성 보관소, ZFS ID 유지,
색인 유지"* 패턴 그대로다(새 원리 0). 재귀 스캔이 확인돼 있어 archived WO도 색인에 남고,
따라서 §2.1의 GC 계수가 성립한다.

## 9. 차단 정책 ([PRO-11] 4값)
**REJECT를 하나도 도입하지 않는다.** 전 판정이 PASS 또는 CLARIFY다.
작업 종료 시점의 차단은 [PRO-13]이 이미 기각한 마찰이다 — *불완전한 인계가 없는 인계보다 낫다*.
같은 논리로 **불완전하게 닫힌 WO가 안 닫힌 WO보다 낫다.**

## 10. 반증 조건
- **A 채택 실패**: WO 문서가 실제로 만들어지지 않고 `next.md` 직접 편집이 계속되면, 문서화 비용이
  이득을 넘은 것 → A 철회, B(표 행 + 어휘 고정)만 존치.
- **표면화 무력**: `work-close`의 CLARIFY가 반복적으로 무시되면(닫힌 WO 중 `closed_by:` 미기입 비율로 관측)
  표면화가 작동하지 않는 것 → 도구 철회. 강제로 올리지 **않는다**([ADR-08]).
- **의례화**: `session-friction` 기준 작업 종료 의도의 왕복 비용이 도입 전보다 늘면 → 검사 축소
  (증거·흔적만 남기고 부모 PLAN 전이 제시 제거).
- **비대**: `sprint/` WO 수가 탐색을 방해하면 → archived 이동 주기를 앞당긴다(설계 철회 아님).

## 11. Split-principle check
(a)/(b) 해당 없음 — **신규 도메인 0**(`WO`는 이미 화이트리스트에 있고 문서가 0건이었을 뿐),
**신규 평면 0**(전부 `sprint/` 안), 신규 디렉터리 1(`sprint/archived/` — `plan/archived/`와 동형).
추가되는 것은 스크립트 1 + TOOL 카드 1이며, 나머지는 **기존 규칙을 다른 도메인에 옮긴 것**이다
(상한=PRO-13 원리, 증거=smell-linter 판정, 생성 뷰=tools-index 패턴, 보관=plan/archived 패턴).

## 12. 승인 시 인간이 확정할 값
1. WO 상한 **1,500 tok** — 확정 또는 조정
2. 닫힘 최소 요구 **흔적 1 + 증거 1(`none — 이유` 허용)** — 확정 또는 "흔적만"으로 완화
3. `Live` **제거** — 확정 또는 보류(보류 시 정의를 부여할 평면을 지정)
4. Closed WO 이동 시점 — 즉시 / 세션 종료 시 / 일정 수 누적 시
5. `sprint/next.md`를 생성 뷰로 전환하는 것 — 기존 수기 표를 버려도 되는지
