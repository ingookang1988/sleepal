# union-stack 게이트 러너 — CI 제공자 비의존 실행 환경. [TOOL-27]
#
# 레포를 **복사하지 않고 마운트**한다. 이미지는 "게이트를 돌리는 환경"일 뿐이고 검사 대상은
# 호스트의 작업트리다 — 그래야 어답터가 자기 레포에서 이미지를 **재빌드 없이** 그대로 쓴다.
# (COPY 로 구우면 어답터마다 이미지가 갈라지고, 로컬 편집마다 재빌드가 필요해진다.)
FROM node:22-alpine

# git: permission-guard 의 diff 범위 · 증거 커밋이 쓴다. 그 외 런타임 의존은 0(zero-dep 원칙).
RUN apk add --no-cache git

# 마운트된 레포는 호스트 uid 소유라 컨테이너의 git 이 "dubious ownership" 으로 거부한다.
# 검사 전용 컨테이너이므로 전 경로를 안전 목록에 둔다.
RUN git config --global --add safe.directory '*'

WORKDIR /repo

# ENTRYPOINT 를 node 로 고정 — 서비스는 스크립트 경로만 고르면 된다(셸 비의존).
ENTRYPOINT ["node"]
CMD ["scripts/ci.js"]
