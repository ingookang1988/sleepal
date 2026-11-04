<!-- spike: 상류(ingookang1988/union-stack)에 올릴 이슈 본문 초안. 올린 뒤 discard. -->

# 제목
`weakening-guard`: 어답터 첫 배송 PR에서 자기 자신을 REJECT한다 (자기언급 오탐, 정규식 리터럴·주석)

# 본문

## 요약
`template-update --apply`로 `scripts/weakening-guard.js`(+ `.test.js`)를 **처음 받는 어답터의 PR**에서 CI 체인(`ci.js --range base..head`)의 `weakening-guard` 단계가 REJECT됩니다. 가드가 자기 파일의 마커 **정의**와 테스트 **픽스처**를 "예외 추가"로 세기 때문입니다. 상류는 파일 생성 이후 diff에 이 파일이 다시 들어올 일이 없어 겪지 않는, 어답터 첫 배송 전용 형상입니다. PR을 쪼개도 이 파일을 들여오는 어느 PR에서든 재발합니다.

## 재현
어답터: `ingookang1988/sleepal`, 상류 `main@20e054f` 동기화 PR.
- 실패 런: https://github.com/ingookang1988/sleepal/actions/runs/41936767759/job/126947079490
- 로컬 재현(어답터 레포, base = 가드가 없던 main):

```bash
node scripts/weakening-guard.js --range main..HEAD
```

```
[약화 가드] REJECT — 예외 증가·만료([PRO-22] §3-4 ⓑ):
  ✗ 예외 목록이 base 대비 +6 늘었다(scripts/weakening-guard.js +3 · scripts/weakening-guard.test.js +3) — known_failures 로 덮인 것 0.
약화 신호(참고):
  ? skip/only 류가 1건 늘었다(scripts/weakening-guard.js)
  ? skip/only 류가 1건 늘었다(scripts/weakening-guard.test.js)
```

## 원인
`analyze()`가 추가 줄에서 `SKIP_RE`·`EXCEPTION_RE` 매치를 `matchesOutsideString`으로 세는데, 따옴표 홀짝 휴리스틱([ADR-19])은 **정규식 리터럴과 주석**을 거르지 못합니다. 첫 배송 diff에서 걸리는 줄:

| 파일 | 걸린 줄 | 종류 |
|---|---|---|
| `weakening-guard.js` | `// 예외 = skip/only · eslint-disable · @ts-ignore/@ts-expect-error · …` | 설명 주석 |
| `weakening-guard.js` | `const SKIP_RE = /\b(it\|test\|…)\.(skip\|only\|todo)\b\|…/;` | 정규식 리터럴 |
| `weakening-guard.js` | `const EXCEPTION_RE = /eslint-disable\|@ts-ignore\|…/;` | 정규식 리터럴 |
| `weakening-guard.test.js` | 픽스처 diff 3줄(`+test.skip(…`, `+// eslint-disable-next-line`, `+// @ts-ignore KF-7` 등 — 따옴표 혼용으로 홀짝이 어긋나는 줄) | 테스트 픽스처 |

`known_failures`로 덮으려면 id가 추가 줄에 보여야 하므로 어차피 가드 파일을 손대야 하고, 설정(`adapter.json`)만으로는 흡수가 안 됩니다. 즉 어답터 쪽에서는 **sync 파일 포크 외에 통로가 없습니다**(ADR-29가 막으려던 바로 그 상황).

## 제안 수정
`analyze()`에서 가드 자신과 그 테스트를 **경로로** 제외합니다. 다른 파일의 같은 마커는 그대로 셉니다(회귀 테스트로 고정). 어답터(sleepal `8c7c481`, [ADR-306])에서 적용·검증한 diff 그대로입니다:

```diff
--- a/scripts/weakening-guard.js
+++ b/scripts/weakening-guard.js
@@ -98,6 +98,12 @@ function numericChanges(f) {
   return out;
 }
 
+// 자기언급 오염 2([ADR-19]의 파일 단위): 이 가드 자신과 그 테스트는 마커를 **정의·픽스처로** 담는다(SKIP_RE·EXCEPTION_RE 리터럴,
+// 설명 주석, 픽스처 diff). 어답터가 template-update 로 이 파일을 처음 받는 PR 에서는 base 에 파일이 없어 전 줄이 "추가"가 되고,
+// 예외 +6 으로 자기 자신을 REJECT 한다(sleepal 실측 2026-11-04 — 상류는 생성 이후 diff 에 이 파일이 다시 들어올 일이
+// 없어 겪지 않는다). 따옴표 휴리스틱은 정규식 리터럴·주석을 거르지 못하므로 **경로로** 제외한다 — 다른 파일의 같은 마커는 그대로 센다.
+const SELF_RE = /(^|\/)weakening-guard(\.test)?\.js$/;
+
 /**
  * 신호 추출(순수). 반환: { signals: [{kind, question, detail}], exceptions: {added, removed, net, where: []} }
  */
@@ -105,6 +111,7 @@ function analyze(files) {
   const signals = [];
   const exceptions = { added: 0, removed: 0, net: 0, where: [] };
   for (const f of files) {
+    if (SELF_RE.test(f.path)) continue;
     const isTest = TEST_FILE_RE.test(f.path);
--- a/scripts/weakening-guard.test.js
+++ b/scripts/weakening-guard.test.js
@@ -84,5 +84,15 @@ try {
   check('CLI(--diff): 무관한 diff → exit 0', r3.status === 0);
 } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
 
+// --- 자기언급 오염 2: 가드 자신·그 테스트의 첫 배송(전 줄 추가)은 예외로 세지 않는다(어답터 첫 PR 실측) ---
+{
+  const selfDiff = "diff --git a/scripts/weakening-guard.js b/scripts/weakening-guard.js\nnew file mode 100644\nindex 0..1\n--- /dev/null\n+++ b/scripts/weakening-guard.js\n@@ -0,0 +1,3 @@\n+// 예외 = skip/only · eslint-disable · @ts-ignore\n+const SKIP_RE = /\\b(it|test)\\.(skip|only)\\b/;\n+const EXCEPTION_RE = /eslint-disable|@ts-ignore/;\n"
+    + "diff --git a/scripts/weakening-guard.test.js b/scripts/weakening-guard.test.js\nnew file mode 100644\nindex 0..1\n--- /dev/null\n+++ b/scripts/weakening-guard.test.js\n@@ -0,0 +1,2 @@\n+const DIFF = [\n+  \"+test.skip('slow', () => {\", '+// eslint-disable-next-line', '+// @ts-ignore KF-7',\n";
+  const self = analyze(parseUnifiedDiff(selfDiff));
+  check('자기 파일(가드·테스트)의 마커 정의·픽스처는 예외로 세지 않는다', self.exceptions.net === 0 && self.signals.length === 0);
+  const other = analyze(parseUnifiedDiff(selfDiff.replace(/scripts\/weakening-guard(\.test)?\.js/g, 'scripts/other.js')));
+  check('같은 내용이 다른 파일이면 여전히 센다(제외는 경로로만)', other.exceptions.net > 0);
+}
+
 console.log(`\n${pass} passed, ${fail} failed`);
```

경로 제외 대신 "정규식 리터럴·주석 줄은 세지 않는다"는 일반 규칙도 생각했지만, `// eslint-disable-next-line`처럼 **주석이 곧 마커인** 예외가 있어 오히려 미탐을 만듭니다. 자기 파일 2개만 경로로 빼는 쪽이 범위가 가장 좁습니다.

## 검증(어답터에서)
- `node scripts/weakening-guard.test.js` 29/29
- `node scripts/weakening-guard.js --range main..HEAD` → PASS(파일 92 · 예외 순증 0)
- `node scripts/ci.js --range main..HEAD` 전 단계 PASS, GitHub Actions 통과: https://github.com/ingookang1988/sleepal/actions/runs/41937392587/job/126949204862

## 상류가 받으면
어답터는 `node scripts/template-update.js --apply --force scripts/weakening-guard.js scripts/weakening-guard.test.js`로 포크를 해제합니다. 어답터 팔(`adopter-arm`)에 "가드를 처음 받는 PR" 형상(base에 가드 없음 → `--range`로 체인 실행)을 한 축 추가하면 같은 부류(첫 배송 자기언급)를 상류에서 미리 잡을 수 있을 것 같습니다 — PRO-17 "같은 게이트를 다른 형상에서 한 번 더"의 범위입니다.
