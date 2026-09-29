# FreeLang Tools

FreeLang 프로젝트에서 공통으로 사용하는 개발자 CLI와 테스트 러너.

## 명령

```bash
fl-tools test
fl-tools check
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
