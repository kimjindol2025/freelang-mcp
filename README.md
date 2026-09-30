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
fl-tools init .
fl-tools start .
fl-tools inspect .
fl-tools review .
fl-tools report .
fl-tools pipeline .
fl-tools handoff .
fl-tools evidence --json .
fl-tools adapter list .
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
npm run test:mcp
npm run test:v11
npm run test:afj
```

`init`은 프로젝트의 `.freelang/worklog.md` 작업 기록 공간을 만든다.
`inspect`는 감지·라우팅·건강검진·상태를 한 번에 출력하고, `report`는 테스트와
리뷰 결과를 완료 보고서 형식으로 출력한다. `handoff`는 다음 작업자를 위한
`.freelang/handoff.md`를 만들고, `evidence --json`은 검증 결과를 JSON으로
보존한다. `adapter list`는 현재 프로젝트에서 사용할 수 있는 런너를 보여준다.
`pipeline`은 init부터 inspect, review, report, handoff까지 자동 실행한다.
배포가 필요하면 `fl-tools pipeline . --deploy`를 사용하며, push는 실행하지 않는다.
`--deploy`도 dirty worktree 보호를 유지하므로, 작업 기록 파일을 먼저 commit하거나
명시적으로 `FREELANG_ALLOW_DIRTY_DEPLOY=1`을 설정해야 한다.

통합형 FreeLang MCP 기반은 [`mcp/README.md`](mcp/README.md)에 정리되어 있다.
현재는 `2025-11-25` stdio legacy handshake와 FreeLang Script 기반 `add` 도구만
지원한다. 실제 연결 검증은 `npm run test:mcp`로 실행한다.

테스트 계약은 세 흐름을 독립적으로 판정한다.

| 명령 | 검증 범위 | 필요한 실행기 | 실행기 부재 |
| --- | --- | --- | --- |
| `npm run test:mcp` | stdio MCP 연결·도구 조회·`add(2,3)`·오류·재연결·감사 기록 | `FREELANG_SCRIPT_RUNNER` 또는 Script 탐색 규칙 | MCP 통합만 `BLOCKED`, 종료 코드 2 |
| `npm test` 또는 `npm run test:v11` | `tests/**/*.test.fl`의 v11 bootstrap 호환 회귀 | `FREELANG_V11_BOOTSTRAP` 또는 `FREELANG_V11_ROOT/bootstrap.js` | v11 회귀만 `BLOCKED`, 종료 코드 2 |
| `npm run test:afj` | `tests/**/*.test.fl`의 AFJ 회귀 | `FREELANG_AFJ_RUNNER` 또는 AFJ 탐색 규칙 | AFJ 회귀만 `BLOCKED`, 종료 코드 2 |

`npm run test:mcp`는 MCP 프로토콜 처리와 FreeLang Script 계산을 검증하고,
`npm test`는 v11 `bootstrap.js`를 명시한 호환 회귀만 검증한다. AFJ 환경이 없다고
해서 두 결과가 함께 차단되거나, MCP/v11 PASS를 native AFJ PASS로 확대하지 않는다.
실제 테스트 실패는 각 명령에서 `FAIL`과 비정상 종료 코드로 남는다.

`fl-test`를 인자 없이 실행하면 기존 자동 감지(`--auto`) 계약을 유지한다. 새 작업이나
보고에서는 위의 `--v11`/`--afj` 명시 명령을 사용한다.

명시 모드에서 각 `.test.fl` 파일은 `node <runner> check <file>` 후
`node <runner> run <file>` 순서로 실행하고, `Test Results: N/N passed`가 없거나
실행기가 실패하면 `FAIL`로 판정한다. v11 런너 탐색 순서는
`FREELANG_V11_BOOTSTRAP`, `FREELANG_V11_ROOT/bootstrap.js`, 로컬 v11
기본 경로다. AFJ 런너 탐색 순서는 `FREELANG_AFJ_RUNNER`, 명시한
`FREELANG_AFJ_ROOT/bootstrap.js`, 설치 기본 경로다. 프로젝트 루트의 임의
`bootstrap.js`는 AFJ 런너로 자동 선택하지 않는다.

AFJ 런너의 설치 기본 경로는 다음과 같다.

```text
/home/kim/kim/platform/freelang-afj/bootstrap.js
```

다른 환경에서는 다음처럼 지정한다.

```bash
FREELANG_AFJ_RUNNER=/path/to/bootstrap.js npm run test:afj
```

v11 호환 회귀는 다음처럼 지정할 수 있다.

```bash
FREELANG_V11_BOOTSTRAP=/path/to/bootstrap.js npm run test:v11
FREELANG_V11_ROOT=/path/to/freelang-v11 npm run test:v11
```

FreeLang v11의 `bin/fl` 같은 C/네이티브 컴파일러는 애플리케이션 실행기로
취급하지 않는다. `test:afj`의 런너는 `check`와 `run`을 제공하는 AFJ
`bootstrap.js`여야 하며, 컴파일러가 존재한다는 이유만으로 AFJ 회귀를 PASS로
판정하지 않는다.

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

배포 경로 자체는 실제 서버에 연결하지 않는 fixture로 검증한다.

```bash
npm run test:deploy-fixture
```

- `route`: 프로젝트 방언·runner·개발/테스트 명령을 요약한다.
- `doctor`: runner, Git, 테스트, 기본 manifest를 점검한다.
- `session`: PM2와 포트·로그를 조회한다. 알 수 없는 서비스를 임의로 재시작하지 않는다.
- `journal`: `.freelang/worklog.md`에 작업 시작·결과를 기록한다.
- `release-check`: CHANGELOG, tag, worktree, artifact hash 준비 상태를 검사한다.
- `safe-push`: `--push`를 명시하기 전에는 원격 상태만 검사한다.
