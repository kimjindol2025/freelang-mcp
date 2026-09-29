# FreeLang Tools

FreeLang 프로젝트에서 공통으로 사용하는 개발자 CLI와 테스트 러너.

## 명령

```bash
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

- `route`: 프로젝트 방언·runner·개발/테스트 명령을 요약한다.
- `doctor`: runner, Git, 테스트, 기본 manifest를 점검한다.
- `session`: PM2와 포트·로그를 조회한다. 알 수 없는 서비스를 임의로 재시작하지 않는다.
- `journal`: `.freelang/worklog.md`에 작업 시작·결과를 기록한다.
- `release-check`: CHANGELOG, tag, worktree, artifact hash 준비 상태를 검사한다.
- `safe-push`: `--push`를 명시하기 전에는 원격 상태만 검사한다.
