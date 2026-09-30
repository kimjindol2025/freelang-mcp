# FreeLang Tools Codex 작업 규칙

이 저장소는 FreeLang 프로젝트를 공통으로 검사·리뷰·배포하기 위한 CLI와
테스트 러너다. 현재 호스트 구현은 Bash이며, FreeLang 테스트 픽스처는
`.fl` 파일로 작성한다.

## 기본 작업 흐름

```text
init → inspect → check/test → review → report → deploy
```

- `fl-tools init <path>`: `.freelang/worklog.md` 작업 기록 공간을 만든다.
- `fl-tools detect <path>`: FreeLang 계열과 런너를 판별한다.
- `fl-tools inspect <path>`: detect, route, doctor, status를 통합 실행한다.
- `fl-tools start <path>`: 작업 시작 컨텍스트와 준비 상태를 출력한다.
- `fl-tools check <path>`: 소스 문법과 테스트를 검사한다.
- `fl-tools review <path>`: check, test, lint, build, diff, 생성물, 계약 drift를 검사한다.
- `fl-tools report <path>`: status와 review를 완료 보고서로 출력한다.
- `fl-tools handoff <path>`: 다음 작업자를 위한 `.freelang/handoff.md`를 생성한다.
- `fl-tools evidence --json <path>`: 검증 결과와 원시 출력을 JSON으로 보존한다.
- `fl-tools adapter list <path>`: AFJ, FX, AIA, Script, Front 런너 상태를 출력한다.
- `fl-tools deploy <path>`: review 통과 후 프로젝트가 제공한 배포·smoke 계약만 실행한다.

## 런너 설정

AFJ 런너는 다음 우선순위로 선택된다.

1. `FREELANG_AFJ_RUNNER`
2. 프로젝트의 `bootstrap.js`
3. `FREELANG_AFJ_ROOT/bootstrap.js`
4. `/root/lang/freelang-afj/bootstrap.js`
5. `/root/freelang-afj/bootstrap.js`

환경별 경로는 명시적으로 설정하는 것을 권장한다.

```bash
export FREELANG_AFJ_RUNNER=/path/to/freelang-afj/bootstrap.js
```

## 검증 명령

```bash
bash -n scripts/* install.sh uninstall.sh tests/deploy-fixture/run.sh
npm test
npm run test:deploy-fixture
npm run review -- .
```

검증 결과는 실제 명령의 출력만 근거로 `PASS`, `FAIL`, `BLOCKED`,
`NOT_APPLICABLE` 중 하나로 기록한다. AFJ 런너나 프로젝트 의존성이 없으면
성공으로 추정하지 않는다.

## 안전 규칙

- 사용자 변경과 미추적 파일을 보존한다.
- `git reset --hard`, broad delete, force-push를 사용하지 않는다.
- `fl-tools deploy`는 dirty worktree에서 기본 차단된다.
- `fl-tools safe-push`는 `--push` 없이는 원격 상태만 확인한다.
- commit, push, 실제 배포는 사용자가 명시적으로 요청한 경우에만 수행한다.
- 토큰·개인키·비밀 환경변수는 출력하거나 문서화하지 않는다.

## 새 코드 언어

저장소 루트 작업 규칙에 따라 새 자동화·검증 스크립트는 가능하면 FreeLang
Script를 우선 검토한다. 다만 이 저장소의 기존 CLI는 POSIX/Bash 실행 호환성이
핵심이므로, 런너 통합·운영체제 API·기존 CLI 유지에 필요한 최소 Bash/Node.js
수정은 허용한다.
