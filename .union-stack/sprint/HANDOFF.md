<!-- [Wiki] 세션 이어달리기. 세션을 마치는 에이전트가 덮어쓴다.
     ⚠ 이 문서는 **포인터만** 담는다. 어떤 사실도 여기에만 있어서는 안 된다 —
     latest-only 이고 손으로 덮어쓰므로 병렬 세션이 서로를 지운다(2026-08-22 실제 발생).
     세부는 소유 WO·평면 문서에 두고 여기서는 ID로 가리킨다. -->
# Handoff → next session

## 1. Summary
NU40·조도 전용 RN 앱 [WO-02f-1]을 Galaxy S22에 설치해 수직 슬라이스 실기까지 완료하고 Closed→아카이브했다. `SLEEPPAL-PILLOW-01` NUS notify, `LUX:2344`, RSSI -66, USB reverse 로컬 PWA 얼굴, SQLite 14:36~14:38 조도 버킷 3개를 확인했고 `feature/live.md`에 Live로 반영했다.

## 2. Changed locations (ID list)
- [PLAN-02] v0.3 · [CON-03] v0.2 · [PLAN-02f] v0.4 · [CON-02f] v0.3 · [CON-02f1] v0.1 · [WO-02f-1] Closed→archived
- `mobile/` · `feature/live.md` · `sprint/next.md` · `sprint/HANDOFF.md`

## 3. Next task (single entry point)
**[PLAN-02f] 단계 7 밤샘 검증** — 30분 예비 런으로 `LUX:` 수신율·`gapMs`·배터리·발열과 `SLEEPING` 정상 종료를 먼저 확인한 뒤 8시간 런으로 확장한다. 새 WO를 02f-2로 만들고 시작할 것.

## 4. Open / cautions
- 동시 보드 세션이 [CON-01] v0.3에 `IMU:`/`MOVE:`를 추가했지만 RN의 [CON-02f1] 범위는 조도 전용이다. 현재 앱은 둘을 unknown으로 무시하고 얼굴/DB에 전달하지 않는다.
- 최신 main의 [CON-03] 제품 기록과 RN 조도 SQLite [CON-02f1]은 별도 계약이다. 동기화는 정의되지 않았고 암묵적으로 합치지 않는다.
- RSSI는 `VERY_NEAR 추정`뿐이며 10cm를 보장하지 않는다. 백그라운드 강제 화면 실행도 범위 밖이다.
- PWA는 현재 HTTPS URL을 WebView로 읽는다. 릴리스 R8을 위한 번들 내장/오프라인 패키징은 후속이다.
- 폰 인터넷이 꺼져 Railway PWA가 실패해 `.env.local`의 `http://127.0.0.1:5173` + ADB reverse로 실기했다. Metro와 `scripts/serve.js`가 현재 실행 중이며 USB 연결이 끊기면 이 로컬 PWA도 끊긴다.
- `npm audit --omit=dev`: Expo CLI/config 전이 의존성 moderate 10건. expo-doctor 권장 버전은 모두 일치하고 비파괴 수정 경로가 없어 강제 downgrade하지 않았다.

## 5. Verification status
- mobile: Jest 13/13 · `tsc` · expo-doctor 21/21 · Gradle `assembleDebug` 489 tasks · Galaxy S22 설치/실행 · NUS GATT/notify/RSSI/LUX/SQLite/PWA 얼굴 실기 통과.
- APK: `mobile/android/app/build/outputs/apk/debug/app-debug.apk` 171MB(재생성 산출물).
- root: npm test 35/35 · lint · health 전 게이트 통과. 미검증: 5Hz 유실률, `SLEEPING` System OFF, 30분/8시간 지속성, PWA 번들 내장.
