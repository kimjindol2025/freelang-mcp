# FreeLang Tools

FreeLang 프로젝트에서 공통으로 사용하는 개발자 CLI와 테스트 러너.

## 다른 서버에 설치

저장소가 공개되어 있으면 다른 서버에서 다음 한 줄로 설치할 수 있다.

```bash
curl -fsSL https://raw.githubusercontent.com/kimjindol2025/freelang-tools/main/install.sh | sh
```

설치기는 `sudo`를 사용하지 않고 다음 위치에만 설치한다.

```text
$HOME/.local/share/freelang-tools
$HOME/.local/bin/fl-tools
$HOME/.local/bin/fl-test
```

`$HOME/.local/bin`이 PATH에 없으면 설치기가 추가할 명령을 출력한다.
비공개 저장소에서는 먼저 인증된 `git clone` 또는 `gh repo clone`을 수행한 뒤
저장소 안에서 `./install.sh`를 실행하거나, `GITHUB_TOKEN`/`GH_TOKEN`을
안전한 환경 변수로 전달해야 한다. 토큰을 URL이나 저장소 설정에 기록하지 않는다.

## 명령

```bash
fl-tools start .
fl-tools review .
fl-tools deploy .
fl-tools test
fl-tools check
fl-tools detect .
fl-tools status .
fl-tools route .
fl-tools doctor .
fl-tools session status
fl-tools journal show
fl-tools release-check
fl-tools safe-push --help
fl-test
```

`fl-test`는 현재 프로젝트의 `tests/**/*.test.fl`을 자동 발견하고, AFJ
런타임의 `check → run`과 `deftest`/`is`/`is=`/`run-tests` 결과를 검사한다.

AFJ 런너 위치는 기본적으로 다음을 사용한다.

```text
/home/kim/kim/platform/freelang-afj/bootstrap.js
```

다른 환경에서는 다음처럼 지정한다.

```bash
FREELANG_AFJ_RUNNER=/path/to/bootstrap.js fl-test
```

프로젝트에 설치하지 않고도 PATH에 연결해 사용할 수 있다.

```bash
ln -s "$PWD/scripts/fl-tools" "$HOME/.local/bin/fl-tools"
ln -s "$PWD/scripts/fl-test" "$HOME/.local/bin/fl-test"
```

## 테스트 파일 규약

```freelang
(deftest "산술" (is= 3 (+ 1 2)))
(run-tests)
```

테스트 파일은 `tests/*.test.fl` 또는 하위 디렉터리의 `*.test.fl` 이름을 사용한다.

`fl-tools`는 계열을 강제로 통합하지 않는다. AFJ, FX, AIA, Script, Front를
판별하고 현재 연결된 어댑터가 없으면 `BLOCKED` 또는 `UNRESOLVED`로 보고한다.

## 운영 명령

표준 작업 흐름은 다음 세 명령이다.

```text
START → CODING → REVIEW → DEPLOY
```

- `start`: 프로젝트·방언·runtime·entrypoint·테스트·Git 상태를 확인한다.
- `review`: check, test, build/lint, diff, 계약·생성물 검사를 묶는다.
- `deploy`: review PASS 이후 프로젝트가 제공한 배포·smoke 계약만 실행한다.
  배포 계약이 없으면 서버 구조를 추측하지 않고 `DEPLOY=BLOCKED`로 끝난다.

- `route`: 프로젝트 방언·runner·개발/테스트 명령을 요약한다.
- `doctor`: runner, Git, 테스트, 기본 manifest를 점검한다.
- `session`: PM2와 포트·로그를 조회한다. 알 수 없는 서비스를 임의로 재시작하지 않는다.
- `journal`: `.freelang/worklog.md`에 작업 시작·결과를 기록한다.
- `release-check`: CHANGELOG, tag, worktree, artifact hash 준비 상태를 검사한다.
- `safe-push`: `--push`를 명시하기 전에는 원격 상태만 검사한다.
