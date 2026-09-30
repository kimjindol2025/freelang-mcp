# freelang-tools Agent Instructions

## Scope

이 문서는 `/root/freelang-tools` 저장소에만 적용된다. 상위 workspace의
보안·Git·보고 규칙도 함께 준수한다.

## Repository role

이 저장소는 FreeLang 계열 프로젝트를 감지하고, 테스트·리뷰·배포 계약을
안전하게 실행하는 공용 개발 도구다. 주요 실행 파일은 `scripts/`에 있고,
테스트는 `tests/`에 있다.

## Required workflow

1. `git status --short --branch`로 사용자 변경을 확인한다.
2. 새 프로젝트는 `fl-tools init <target>`으로 작업 기록을 준비한다.
3. `fl-tools inspect <target>`으로 프로젝트 경계를 확인한다.
4. 수정 후 Bash 문법 검사와 관련 `npm` 테스트를 실행한다.
5. AFJ 의존 테스트는 `FREELANG_AFJ_RUNNER`를 실제 경로로 설정해 실행한다.
6. `fl-tools report <target>` 결과와 diff, 환경 한계를 보고한다.
7. 필요하면 `fl-tools handoff <target>`와 `fl-tools evidence --json <target>`로
   다음 작업자에게 전달할 상태를 보존한다.
8. 반복 작업은 `fl-tools pipeline <target>`으로 자동화하되, 배포는 `--deploy`를
   명시한 경우에만 허용한다. pipeline은 Git push를 실행하지 않는다.

## Implementation rules

- 기존 Bash CLI의 출력 계약(`KEY=VALUE`)을 깨지 않는다.
- 런너 경로를 새로 하드코딩하지 말고 환경변수 또는 감지 로직을 사용한다.
- `/dev/fd`나 프로세스 치환처럼 환경에 따라 사라질 수 있는 기능은 꼭 필요한
  경우가 아니면 피한다.
- 배포 계약은 프로젝트가 제공한 실행 파일만 사용한다. 서버 구조를 추측하거나
  임의의 프로세스를 재시작하지 않는다.
- `apply_patch`로 수정하고, 테스트 픽스처가 만든 산출물은 정리한다.

## Standard commands

```bash
./scripts/fl-tools help
./scripts/fl-tools init .
./scripts/fl-tools inspect .
./scripts/fl-tools detect .
./scripts/fl-tools review .
./scripts/fl-tools report .
./scripts/fl-tools pipeline .
./scripts/fl-tools handoff .
./scripts/fl-tools evidence --json .
./scripts/fl-tools adapter list .
npm test
npm run test:deploy-fixture
```

## Git and delivery

- commit과 push는 요청받았을 때만 수행한다.
- push 전 remote, branch, HEAD, worktree 상태를 확인한다.
- 인증정보를 명령 출력·문서·커밋에 넣지 않는다.

## Completion report

완료 보고에는 변경 파일, 변경 동작, syntax/test/runtime 결과, 모바일·환경
제한, 임시 프로세스 정리, commit hash 또는 `NOT_COMMITTED`, push 상태를
포함한다.
