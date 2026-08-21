<!-- [Proposal] 승인 전 효력 없음. profile(행위자) pillar 신설 제안. 스키마 값은 가공 예시. -->
---
id: PRO-03
title: profile(행위자) pillar 신설 — 인간(user/team/org) + 에이전트 선호 레지스트리
status: Approved
decided_by: human-architect
reason: "profile(행위자) pillar 신설 승인. 비-ZFS 평탄 레지스트리·Wiki tier·user-wins 캐스케이드·한국어 어휘 자체 정의."
version: 1.0
---

# [PRO-03] profile(행위자) pillar 신설

## 1. 제안 요지
union-stack 최초의 **"행위자(actor)" 축**을 신규 최상위 pillar `.union-stack/profile/`로 추가한다.
기존 pillar는 전부 *작업물*에 관한 것이고, profile은 **"누가 관여하는가"** 와 그 **통신·페르소나 선호**를 담는다.
- **인간 측**: user ⊂ team ⊂ org (가산적 중첩, 참조 기반).
- **에이전트 측**: agent (A2A Agent Card 차용, 장차 agent team/org 확장).
- 권한은 **선언적 표기만** — 실제 집행은 플랫폼(Claude Code/Codex)에 위임. RBAC 엔진 아님.

> 근거: `SPIKE-profile_axis.md` + `[MTG-02a]` 심의(딥리서치 25주장 검증·0기각·1차 출처).

## 2. 확정된 설계 결정 ([MTG-02a])
- **위치**: 신규 최상위 pillar `.union-stack/profile/` (하위 `human/` + `agent/`).
- **네이밍**: **비-ZFS 평탄 레지스트리**(`feature/live.md` 방식). profile은 분해 트리가 아니라 행위자 레지스트리 —
  Luhmann 계보가 의문상 안 맞음. **도메인 신설 불필요**(zfs-linter는 profile/을 스캔 안 함).
- **tier**: **Wiki**(서술형 선호 — 본인 소유·행 단위 갱신). 권한 필드는 advisory만.
- **캐스케이드**: 선호 스칼라 `user > team > org`(구체적인 게 이김), 객체 키 단위 deep-merge,
  `org.policy.*` 가드레일만 org-wins.
- **한국어 어휘**: CLDR `formality`/`usage` 축 + `koreanSpeechLevel`(해요체/하십시오체/반말) enum + 관계별 호칭맵.

## 3. 제안 스키마 (값은 전부 가공 예시)
### user (예시)
```yaml
id: usr-example
displayName: 예시-사용자
nickName: 인구
honorificPrefix: 님
preferredLanguage: ko
locale: ko-KR
timezone: Asia/Seoul
verbosity: concise
address:
  formality: formal
  koreanSpeechLevel: 하십시오체
  usage_addressing: "OO님"
  usage_referring: "OO님께서"
authority: maintainer   # advisory only (플랫폼이 집행)
```
### team / org / agent (예시 요약)
- team: `displayName` + `members[]`(참조) + `overrides{}`.
- org: `teams[]` + `policy{}`(가드레일, org-wins).
- agent: `name` `description` `version` `provider{organization,url}` `interactionStyle{}` (A2A 차용).
  ※ 재점검(2026-06): A2A 스펙은 v1.0.0으로 승급(리서치 시점 v0.3.0). 본 제안은 필드 *구조 패턴*만
  차용하므로 영향 없음 — A2A 호환을 주장하지 않는다.

## 4. 변경 영향 범위 (승인 시 구현 대상)
**새 파일/디렉터리:**
- `.union-stack/profile/_GUIDE.md`, `profile/human/_GUIDE.md`, `profile/agent/_GUIDE.md`.
- 더미 예시: `profile/human/user_example.md`·`team_example.md`·`org_example.md`, `profile/agent/agent_example.md`
  (모두 `example` 마커 → init 시 자동 제거, leakage-guard 통과).

**코드/툴링 (Schema 아님 — 게이트 스크립트·엔트리):**
- `scripts/leakage-guard.js` — `SCAN_DIRS`에 `.union-stack/profile` 추가(PII 규율 강제).
- `.gitignore` — 실프로필 제외 패턴 추가: `.union-stack/profile/**/*.local.md`.
  ※ 재점검(2026-06): `*.local.md` + gitignore는 AGENTS.md 생태계의 정착 관례(`AGENTS.local.md` —
  개인 선호를 팀 공유 파일에서 분리)와 일치 — 외부 선례로 뒷받침됨.
- `AGENTS.md` — 부트스트랩에 "활성 user/agent profile 읽어 존댓말·호칭·톤 적응"(IDENTITY 직후) +
  규칙2 tier 설명에 profile=Wiki 한 줄. ※ zfs-linter `TARGET_DIRS`·`permission-guard`는 **변경 불필요**
  (profile 미스캔, Wiki='other' 분류).

**검증:** `leakage-guard`·`zfs-linter`·`permission-guard`·`health` 전 게이트 그린 확인.

## 5. 명시적 이월(후속) — 이 PRO 범위 밖
- **PII gitignore / example-vs-real 분리**: 리서치 갭(검증 0건). 본 PRO는 최소안(`*.local.md` ignore + 더미 예시)만.
  심화는 **별도 스파이크**.
- **agent-team/org 전용 리소스**: v1은 `provider.organization` 표기로 충분. 확장은 후속 PRO.

## 6. 결정 (대기)
- → 승인 시: 4절을 한 번에 구현하고 전 게이트로 검증.
- → 기각 시: status=Rejected + 사유 보존(반복 제안 방지).

> 본 제안은 신규 pillar(하네스 구조) 변경이므로 승인 전까지 코드·엔트리 파일을 수정하지 않는다.
