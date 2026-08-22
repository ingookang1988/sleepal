<!-- [Wiki] 세션 이어달리기. 세션을 마치는 에이전트가 덮어쓴다.
     ⚠ 이 문서는 **포인터만** 담는다. 어떤 사실도 여기에만 있어서는 안 된다 —
     latest-only 이고 손으로 덮어쓰므로 병렬 세션이 서로를 지운다(2026-08-22 실제 발생).
     세부는 소유 WO·평면 문서에 두고 여기서는 ID로 가리킨다. -->
# Handoff → next session

## 1. Summary
중복 RN 커밋의 rebase 충돌을 최신 `main` 기준으로 해소하고, 기존 staged Firebase 배포·BLE 촬영 트리거·NFC 조사 자산을 복원했다. NFC custom-scheme 프로토타입은 [CON-02g] HTTPS App Link 확정 전까지 앱 설정에 연결하지 않았다.

## 2. Changed locations (ID list)
- [CON-01] v0.6 · [ANL-01a] · [WO-01a-2] · [WO-02f-3]
- [PLAN-02g] · [ANL-02g] · [CON-02g] v0.2 · [WO-02g-1] · [WO-02g-2]
- `demo/` · `mobile/` · `sprint/next.md` · `sprint/HANDOFF.md`

## 3. Next task (single entry point)
**[WO-01b-5] 브라우저 시트·폰 미적 검증** — `app/face-sheet.html`의 37개 assertion을 실제 브라우저에서 실행하고, 앱 키 6/7/8과 조도 불켜기·끄기로 happy/curious/sad/startled/relieved의 입·눈꺼풀 강도를 확인한다.

## 4. Open / cautions
- [WO-02f-3] 실제 Firebase 업로드는 Firebase·EAS 재로그인과 서명 APK가 필요하다.
- `mobile/src/nfc/`·`plugins/withSleepalNfc.js`의 `sleepal://` 프로토타입은 [CON-02g] v0.2의 HTTPS PWA 폴백과 불일치하므로 앱 설정에서 비활성이다.
- [WO-01a-2]의 `STATE:`·`SLEEPING`·System OFF·의도 LUX step 실기는 미완료다.
- [WO-01b-5]는 브라우저·폰 표정 실기 전 Closed로 올리지 않는다.

## 5. Verification status
- 충돌 마커 0 · root 37/37 · lint · health · strict permission guard 통과.
- mobile Jest 19/19 · App Distribution 2/2 · `tsc` · expo-doctor 21/21 · Expo public config 통과.
- demo Python compile · shell syntax 통과.
- 직전 실기: Gradle `assembleDebug` 성공(346 tasks) · Galaxy S22 설치 · NU40 RSSI -54 · `LUX:1780` 수신.
