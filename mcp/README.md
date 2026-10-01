# FreeLang MCP 기반

## 적용 규약

기존 stdio 전송은 공식 MCP `2025-11-25` legacy handshake 규약을 지원한다.

- transport: stdio
- framing: 줄 단위 UTF-8 JSON-RPC 2.0
- lifecycle: `initialize` → `notifications/initialized` → operation
- supported operations: `ping`, `tools/list`, `tools/call`, `shutdown`, `exit`
- server capability: `tools`
- registered tools: see the tool table and project commands below
- not supported on this transport: OAuth, resources, prompts, tasks, modern
  per-request `_meta`

Streamable HTTP는 공식 MCP `2026-07-28` 규약으로 별도 지원한다.

- endpoint: 단일 `POST /mcp`
- lifecycle: stateless `server/discover`; `initialize`/session 없음
- supported operations: `server/discover`, `tools/list`, `tools/call`
- required metadata: `MCP-Protocol-Version`, `Mcp-Method`, `tools/call`의 `Mcp-Name`
- response: JSON-RPC JSON response; notifications는 `202 Accepted`
- security: bearer token, Origin allowlist, body size limit, loopback 기본 바인딩
- TLS: `MCP_HTTP_TLS_CERT`와 `MCP_HTTP_TLS_KEY`를 함께 지정할 때만 활성화
- excluded: OAuth discovery/flow, SSE long-lived subscriptions, resources, prompts,
  tasks, files, DB, approval, remote app management

공식 근거:

- https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle
- https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http
- https://modelcontextprotocol.io/specification/2026-07-28/server/tools

stdio와 HTTP는 서로 다른 lifecycle을 사용하며, 한 전송 안에서 handshake를
혼합하지 않는다.

## 등록된 FreeLang 도구

| 이름 | 설명 | 입력 | 성공 결과 | 오류 |
| --- | --- | --- | --- | --- |
| `add` | FreeLang Script로 두 숫자를 더한다 | 객체 `{ "a": number, "b": number }` (두 필드 필수, 추가 필드 불허, 유한한 숫자) | `content[0].text`와 `structuredContent.result`에 계산 결과 | 잘못된 입력 `INVALID_INPUT`, 실행기 부재 `FREELANG_RUNNER_UNAVAILABLE`, 실행 실패 `FREELANG_EXECUTION_ERROR` 또는 `FREELANG_INVALID_RESULT` |
| `project_info` | 현재 MCP workspace 메타데이터를 조회한다 | `{}` | 프로젝트, 프로토콜, workspace, 등록 도구 목록 | 잘못된 입력 |
| `read_source` | workspace 내부 소스 파일을 제한된 줄 범위로 읽는다 | `{ "path": string, "startLine": integer, "endLine": integer }` (`path` 필수) | 파일 경로와 줄 범위, 내용 | 경로 범위·파일 크기·줄 범위 오류 |
| `search` | workspace 소스에서 문자열을 검색한다 | `{ "query": string, "path": string }` (`query` 필수) | 최대 50개 경로·줄·내용 일치 결과 | 경로 범위·빈 검색어·파일 오류 |
| `status` | 프로젝트 상태를 조회한다 | `{ "project": string }` 선택 (MCP workspace 내부 상대 경로) | 기존 `fl-status` 출력과 PASS/FAIL | 경로 범위·프로젝트·실행 오류 |
| `check` | 프로젝트 검사 게이트를 실행한다 | `{ "project": string }` 선택 (MCP workspace 내부 상대 경로) | 기존 `fl-check` 출력과 PASS/FAIL | 경로 범위·검사 실패 |
| `test` | 프로젝트 테스트 게이트를 실행한다 | `{ "project": string }` 선택 (MCP workspace 내부 상대 경로) | 기존 `fl-test --auto` 출력과 PASS/FAIL | 경로 범위·테스트 실패 |

추가로 `start`, `inspect`, `review`, `report`, `detect`, `route`, `doctor`,
`release_check`, `evidence`, `adapter`, `handoff`, `init`, `pipeline`, `journal`,
`session_status`가 등록되어 있다. 각 도구는 동일한 고정 스크립트
계약을 호출한다. `init`, `handoff`, `pipeline`, `journal`은
`confirm: true`가 없으면 실행되지 않는다. `confirm`은 요청 인자일 뿐
별도 사용자 승인 절차가 아니므로, push는 MCP에 노출하지 않고 CLI에서만 수행한다.
프로젝트 검증 도구의 종료 코드 2는 `BLOCKED`로 반환한다.

현재 등록 목록은 `add`, `project_info`, `read_source`, `search`, `status`, `check`, `test`를 포함한다. MCP 호스트는 JSON 입력 형식을 확인하고,
`mcp/core/add.fls`가 전달받은 값의 숫자 변환과 덧셈을 실제로 수행한다.
임의 코드·셸 명령 실행 도구는 등록하지 않는다. `deploy`는 MCP에 등록하지 않고
개별 배포 절차로 유지한다. 프로젝트 도구는 저장소에 등록된 고정 `scripts/fl-*`
명령만 실행하며, 대상의 실제 경로는 MCP workspace 내부로 제한한다.

## 계층

```text
MCP stdio/JSON-RPC ──┐
                      ├─ mcp/service.mjs   도구 호출·검증·감사·FreeLang 경계
MCP Streamable HTTP ─┘
      ├─ mcp/stdio-server.mjs       legacy 연결·lifecycle
      ├─ mcp/http-server.mjs        modern HTTP·auth·Origin·body limit
      ├─ mcp/registry.mjs            도구 등록·JSON Schema
      ├─ mcp/policy.mjs              도구 허용·인자 구조 판정
      ├─ mcp/runner.mjs              FreeLang Script 실행 어댑터
      ├─ mcp/audit.mjs               비밀정보 없는 JSONL 실행 기록
      └─ mcp/core/add.fls            실제 숫자 변환·검증·덧셈
```

FreeLang Script 프로파일에는 stdin 스트림을 직접 읽는 안정적인 표준 API가
확인되지 않았다. 따라서 `mcp/stdio-server.mjs`를 stdio 경계 어댑터로 두고,
호스트에서 MCP 입력 형식을 검사한 뒤 `mcp/core/add.fls`에서 숫자 변환을
재확인하고 계산한다. 어댑터는 MCP 프레이밍과 FreeLang 런너 호출을 맡는다.

## 실행

### MCP 호스트 등록

stdio 방식으로 등록할 때 `command`에는 실행 파일을, `args`에는 서버 파일을
넣는다. `--version`은 실행 파일이 아니므로 `command`에 넣으면 안 된다.

```json
{
  "mcpServers": {
    "freelang": {
      "command": "node",
      "args": ["/absolute/path/to/freelang-mcp/mcp/stdio-server.mjs"],
      "env": {
        "FREELANG_SCRIPT_RUNNER": "/absolute/path/to/freelang-script/bin/fl-script-unified.js"
      }
    }
  }
}
```

다음과 같은 등록은 잘못된 설정이다.

```json
{ "command": "--version" }
```

이 경우 호스트가 `spawn --version ENOENT`로 실패한다. 버전 확인이 필요하면
별도 터미널에서 `node --version`을 실행하고, MCP transport의 `command`는
항상 `node`로 둔다. 바로 복사할 수 있는 예시는
[`client-configs/freelang-mcp-stdio.json`](client-configs/freelang-mcp-stdio.json)에
있다.

```bash
FREELANG_SCRIPT_RUNNER=/root/freelang-script/bin/fl-script-unified.js \
  node mcp/stdio-server.mjs
```

HTTP는 loopback과 bearer token을 명시해야 시작한다.

```bash
MCP_HTTP_BEARER_TOKEN=change-me \
FREELANG_SCRIPT_RUNNER=/root/freelang-script/bin/fl-script-unified.js \
  npm run mcp:http
```

기본값은 `127.0.0.1:41951/mcp`이며 다음 환경변수로 조정한다.

```text
MCP_HTTP_HOST
MCP_HTTP_PORT
MCP_HTTP_BEARER_TOKEN
MCP_HTTP_ALLOWED_ORIGINS       # comma-separated exact origins
MCP_HTTP_MAX_BODY_BYTES        # default 65536
MCP_HTTP_TLS_CERT + MCP_HTTP_TLS_KEY
```

non-loopback 바인딩은 TLS 인증서와 키가 모두 없으면 시작하지 않는다. 외부
공개는 기존 TLS reverse proxy가 실제로 upstream에 연결되는지 확인한 뒤에만
가능하며, DNS·nginx·PM2 설정은 이 저장소가 변경하지 않는다.

실행기 탐색은 `mcp/runner.mjs`의 `resolveRunner()`가 단일 기준으로 담당한다.
`FREELANG_SCRIPT_RUNNER`가 설정되면 해당 경로만 확인하고, 없으면
`FREELANG_SCRIPT_ROOT/bin/fl-script-unified.js`와 로컬 공통 경로를 순서대로
탐색한다. 실행기 부재는 MCP 응답 타임아웃으로 숨기지 않고
`FREELANG_RUNNER_UNAVAILABLE`로 즉시 반환한다. 실행 시간 제한은
`FREELANG_SCRIPT_TIMEOUT_MS`로 조정하며 기본값은 15000ms이고, 초과 시
`FREELANG_EXECUTION_TIMEOUT`으로 구분한다.

실행 기록 기본 위치:

```text
.freelang/mcp-executions.jsonl
```

`MCP_EXECUTION_LOG` 환경변수로 위치를 지정할 수 있다. 각 record에는
`requestId`, `toolName`, `success`, `durationMs`, `errorCode`, `timestamp`만
기록하고 인자·결과 원문·비밀정보는 기록하지 않는다.

## 실제 wire 검증

```bash
npm run test:mcp
```

이 테스트는 서버를 자식 프로세스로 실행하는 실제 stdio MCP 클라이언트다.
요청 처리 테스트는 실행기 없이도 실행하며 `null`, 배열, 원시값, 잘못된 객체,
초기화 전 도구 접근, `initialized` 단독 알림, 정상 notification 무응답과
정리 동작을 검증한다. 실행기가 발견되면 별도로 실제 FreeLang Script를 통해
연결, 도구 조회, `add(2,3)`, 잘못된 입력, 없는 도구, 연속 request ID 기록,
서버 재시작 후 재연결·재호출을 검증한다. 실행기가 없으면 결과는
`MCP_REQUEST_HANDLING=PASS`와 `MCP_INTEGRATION=BLOCKED`로 분리되며,
FreeLang 계산 PASS로 보고하지 않는다.

HTTP의 실제 wire 검증은 공식 TypeScript SDK client를 사용한다.

```bash
MCP_HTTP_BEARER_TOKEN=change-me \
  npm run test:mcp:http
```

이 테스트는 `server/discover`로 `2026-07-28`을 고정하고 `tools/list` 후
`tools/call(add)`를 수행한다. 자체 `curl` 검사는 오류·보안 거부 확인에만
사용하고 SDK 호환 PASS의 근거로 사용하지 않는다.

HTTP 본문 제한과 Content-Type 회귀는 실행기 없이
`npm run test:mcp:http:requests`로 검증한다. 제한을 넘는 요청은 본문 종료를
기다리지 않고 HTTP 413을 반환한 뒤 연결을 닫는다.

## 다음 단계

이번 단계 이후 계획은 다음 순서로만 확장한다.

1. 연결 안정성: timeout, cancellation, protocol version probing
2. 권한·승인: 사용자 승인과 tool별 capability policy
3. 파일·DB 도구: 명시적 scope와 FreeLang adapter
4. 원격 연결: Streamable HTTP, 인증, Origin 검증

이번 단계에서는 위 기능을 구현하지 않는다.
