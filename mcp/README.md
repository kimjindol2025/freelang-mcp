# FreeLang MCP 기반

## 적용 규약

1차 구현은 공식 MCP `2025-11-25` legacy handshake 규약을 지원한다.

- transport: stdio
- framing: 줄 단위 UTF-8 JSON-RPC 2.0
- lifecycle: `initialize` → `notifications/initialized` → operation
- supported operations: `ping`, `tools/list`, `tools/call`, `shutdown`, `exit`
- server capability: `tools`
- supported tool: `add`
- not supported: Streamable HTTP, OAuth, resources, prompts, tasks, modern
  `2026-07-28` per-request `_meta`/`server/discover`

공식 근거:

- https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle
- https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- https://modelcontextprotocol.io/specification/2025-11-25/server/tools

현재 구현은 modern `2026-07-28` 규약과 dual-era 호환을 주장하지 않는다.

## 계층

```text
MCP stdio/JSON-RPC
  └─ mcp/stdio-server.mjs       연결 계층·요청 응답·lifecycle
      ├─ mcp/registry.mjs        도구 등록·JSON Schema
      ├─ mcp/policy.mjs          도구 허용·인자 구조 판정
      ├─ mcp/runner.mjs          FreeLang Script 실행 어댑터
      ├─ mcp/audit.mjs           비밀정보 없는 JSONL 실행 기록
      └─ mcp/core/add.fls        실제 숫자 변환·검증·덧셈
```

FreeLang Script 프로파일에는 stdin 스트림을 직접 읽는 안정적인 표준 API가
확인되지 않았다. 따라서 `mcp/stdio-server.mjs`만 stdio 경계 어댑터로 두고,
계산과 입력 숫자 검증은 `mcp/core/add.fls`에서 수행한다. 이 어댑터는 MCP
프레이밍과 FreeLang 런너 호출 외의 도구 업무를 맡지 않는다.

## 실행

```bash
FREELANG_SCRIPT_RUNNER=/root/freelang-script/bin/fl-script-unified.js \
  node mcp/stdio-server.mjs
```

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

## 다음 단계

이번 단계 이후 계획은 다음 순서로만 확장한다.

1. 연결 안정성: timeout, cancellation, protocol version probing
2. 권한·승인: 사용자 승인과 tool별 capability policy
3. 파일·DB 도구: 명시적 scope와 FreeLang adapter
4. 원격 연결: Streamable HTTP, 인증, Origin 검증

이번 단계에서는 위 기능을 구현하지 않는다.
