---
id: WO-02f-3
title: RN Android Firebase App Distribution 연결
status: Active
parent: PLAN-02f
evidence: "mobile Jest 13/13 · App Distribution 스크립트 2/2 · tsc · expo-doctor 21/21 · 실제 Firebase 업로드는 CLI 재로그인 후 확인"
closed_by: []
---

# [WO-02f-3] RN Android Firebase App Distribution 연결

## 목표

`mobile/`의 Android APK를 EAS에서 서명해 `sleepal-app` Firebase App Distribution으로 반복 배포할 수 있게 한다. Android applicationId는 기존 `com.sleepal.mobile`을 유지한다.

## 수용 기준

- [x] EAS에 App Distribution 전용 내부 배포 APK 프로필이 있다
- [x] Firebase CLI 기본 프로젝트가 `sleepal-app`으로 고정되어 있다
- [x] APK·Firebase App ID·테스터 그룹을 명시적으로 받는 업로드 명령이 있다
- [x] 인증 키·테스터 이메일을 저장소에 커밋하지 않는다
- [ ] Firebase Android 앱 패키지가 `com.sleepal.mobile`인지 CLI로 확인한다
- [ ] EAS 서명 APK 한 건을 Firebase App Distribution에 업로드한다
- [ ] 테스터 설치 링크와 Android 실기 설치를 확인한다

## 증거

로컬은 Jest 13/13, App Distribution 스크립트 2/2, TypeScript, expo-doctor 21/21을 통과했다. 첫 Firebase release URI를 완료 증거로 추가해야 한다. 현재 Firebase 사용자 토큰은 만료됐고 EAS CLI는 미로그인 상태라 외부 배포 증거는 아직 없다.
