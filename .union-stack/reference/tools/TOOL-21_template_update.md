<!-- 방법론 자산 카드(leakage-guard METHODOLOGY 등재) — 이 템플릿이 실제로 배송하는 도구. -->
---
id: TOOL-21
title: 템플릿 업데이트 (어답터 ↔ 상류 버전·드리프트 계측)
kind: cli
impl: scripts/template-update.js
status: Active
version: 1.1
---

# [TOOL-21] 템플릿 업데이트

## 용도
어답터 레포의 템플릿 버전(CHANGELOG 최신 헤딩)과 방법론 파일 드리프트를 상류(github.com/ingookang1988/union-stack)와 대조하고, sync 카테고리만 갱신한다.

> **로컬 개조 보호(3-way, [ADR-29]).** sync 는 "덮어써도 잃을 것이 없다"가 전제였는데 실전 어답터는
> sync 파일에 정당한 개조를 갖는다(실측: `--apply` 가 2건을 조용히 덮어써 게이트 2개가 즉시 FAIL).
> 이제 `로컬 vs 마지막 정합 앵커 vs 상류` 를 대조해 `clean` 만 쓰고, `modified`(개조)·`unknown`
> (앵커 없음 — 판별 불가)은 **건너뛴다**. `--force` 로만 덮어쓴다.
> 앵커는 `.union-stack/template-sync.json` — `--apply` 가 쓴 파일의 상류 sha 를 기록하고 `init.js`
> 가 클론 시점에 시딩한다. **개조를 없애는 정공법은 설정 흡수다**: `.union-stack/adapter.json` 의
> `private`·`zfsIgnored`(MIGRATION.md §"Adopter configuration").

## 언제 쓰나
- 주기 점검 또는 상류 릴리스 공지 후. `--apply` 전에 보고를 먼저 읽는다.
- 보고에 ⚠(마이그레이션 필요)가 있으면 MIGRATION.md §"Upgrading" 절차를 함께 수행한다.
- 갱신 후 검증: `node scripts/health.js` + 테스트. review 카테고리(AGENTS.md·_GUIDE)는 인간이 diff를 보고 반영한다.

## 언제 쓰지 않나
- `.union-stack/` 콘텐츠(어답터의 실제 문서) 동기화 — 이 도구는 절대 건드리지 않는다.
- 오프라인 — 상류 조회 실패 시 추측하지 않고 REJECT(1)로 끝난다.
- 포크로 템플릿 자체를 개발 중일 때의 역방향 기여 — 그건 PR이지 update가 아니다.

## 호출
```bash
node scripts/template-update.js              # 확인만: exit 0(최신) / 3(업데이트 있음, 비차단)
node scripts/template-update.js --apply      # sync 파일 갱신(개조·판별불가는 보존, review는 보고만)
node scripts/template-update.js --apply --force  # 보존 해제 — 개조·판별불가까지 덮어씀
node scripts/template-update.js --ref v6.1.0 # 특정 태그 기준 (--json 지원, guard 목록 포함)
```
