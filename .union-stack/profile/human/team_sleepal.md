<!-- [Wiki] SleepPal 팀 레지스트리 — 공개 식별자(GitHub 핸들)·역할·advisory 권한만 담는다.
     실명·연락처·호칭 선호(PII)는 각자의 `user_*.local.md`(gitignored)에 — profile/_GUIDE 규범. -->
# team_sleepal — SleepPal 팀

- id: `team_sleepal` · displayName: SleepPal 팀 (2~3인)

## members (by reference — user id = GitHub 핸들, 실프로필은 각자 local)

| id | 역할 | 파트 ([PLAN-02] §분해와 파트 소유권) | authority (advisory) |
|---|---|---|---|
| `ingookang1988` | **PO · 프로젝트 총괄 · 기획** | **H (하드웨어–표정)**: 01a·01b 이월 + 02b + 기획 전반 | **owner — 최고 권위.** Schema 승격(`draft→reviewed→ratified`) · GRANTS 부여 · 시나리오 선택([PRO-10]) · 파트 배분 · 인간 결정 항목 전부 |
| (합류 예정) | 개발 | **T (트래킹 앱)**: 02c · 02d · 02e — ADR 대역 401–499 | contributor |
| (3인 시) | 개발 | 02b(놀이) — H에서 이관, ADR 대역은 next free(501–599) 할당([ARCH-00]) | contributor |

## overrides (팀 기본 선호 — 각 user 의 값이 이긴다)
`preferredLanguage: ko` · `address.formality: formal` · `verbosity: normal`

## 규칙 포인터
- authority 는 **선언이지 집행이 아니다**(CODEOWNERS 패턴, `_GUIDE`). 집행은 `permission-guard`(Approved-by)와 `GRANTS.md`.
- HANDOFF 는 리드(PO)만 쓴다([PRO-06] · [PLAN-02] §경계 3).
