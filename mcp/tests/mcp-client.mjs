import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { resolveRunner, runAdd } from "../runner.mjs";

const ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
const SERVER = path.join(ROOT, "mcp", "stdio-server.mjs");
const REQUEST_TIMEOUT_MS = 20000;
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "freelang-mcp-test-"));
const logFile = path.join(tempRoot, "executions.jsonl");
const activeServers = new Set();

function requestId(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, "id")
    ? value.id
    : null;
}

function startServer(scriptRunner = resolveRunner(), serverLog = path.join(tempRoot, `server-${activeServers.size}.jsonl`)) {
  const child = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: { ...process.env, FREELANG_SCRIPT_RUNNER: scriptRunner || "/freelang-mcp-test/missing-script-runner.js", MCP_EXECUTION_LOG: serverLog },
    stdio: ["pipe", "pipe", "pipe"]
  });
  let buffer = "";
  let stderr = "";
  let closed = false;
  let stopping = false;
  let queued = [];
  let waiters = [];
  const timers = new Set();

  function failWaiters(error) {
    for (const waiter of waiters.splice(0)) {
      clearTimeout(waiter.timer);
      timers.delete(waiter.timer);
      waiter.reject(error);
    }
  }

  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    while (buffer.includes("\n")) {
      const index = buffer.indexOf("\n");
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      if (!line.trim()) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch (error) {
        failWaiters(new Error(`invalid MCP output: ${error.message}`));
        child.kill("SIGTERM");
        return;
      }
      const waiter = waiters.shift();
      if (waiter) {
        clearTimeout(waiter.timer);
        timers.delete(waiter.timer);
        waiter.resolve(message);
      } else {
        queued.push(message);
      }
    }
  });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  child.on("error", (error) => failWaiters(error));
  child.on("exit", (code, signal) => {
    closed = true;
    if (!stopping && code !== 0) failWaiters(new Error(`MCP server exited (${code ?? signal}): ${stderr.trim()}`));
    else failWaiters(new Error(`MCP server exited before responding: ${stderr.trim()}`));
  });
  function receive(timeoutMs = REQUEST_TIMEOUT_MS) {
    if (queued.length) return Promise.resolve(queued.shift());
    if (closed) return Promise.reject(new Error(`MCP server is closed: ${stderr.trim()}`));
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) waiters.splice(index, 1);
        timers.delete(waiter.timer);
        reject(new Error(`MCP client response timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      timers.add(waiter.timer);
      waiters.push(waiter);
    });
  }
  async function request(message) {
    child.stdin.write(`${JSON.stringify(message)}\n`);
    return receive();
  }
  async function notify(message) {
    child.stdin.write(`${JSON.stringify(message)}\n`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  async function waitForExit(timeoutMs) {
    if (closed) return;
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      timers.add(timer);
      child.once("exit", () => {
        clearTimeout(timer);
        timers.delete(timer);
        resolve();
      });
    });
  }
  async function close() {
    if (stopping) return;
    stopping = true;
    try {
      if (!closed) {
        try { await request({ jsonrpc: "2.0", id: 99, method: "shutdown" }); } catch { /* cleanup continues */ }
        if (!closed) {
          try { child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "exit" })}\n`); } catch { /* already closed */ }
          await waitForExit(1000);
        }
      }
      if (!closed) {
        child.kill("SIGTERM");
        await waitForExit(500);
      }
      if (!closed) {
        child.kill("SIGKILL");
        await waitForExit(500);
      }
    } finally {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      failWaiters(new Error("MCP server cleanup completed"));
      activeServers.delete(server);
    }
  }
  const server = { request, notify, close, queuedCount: () => queued.length };
  activeServers.add(server);
  return server;
}

function assertAddResponse(response, id, expected) {
  assert.equal(response.id, id);
  assert.equal(response.result.isError, false, JSON.stringify(response));
  assert.equal(response.result.structuredContent.result, expected);
  assert.equal(response.result.content[0].text, String(expected));
}

function assertProtocolError(response, code) {
  assert.equal(response.jsonrpc, "2.0");
  assert.equal(response.error.code, code);
}

async function expectNoResponse(server, message) {
  await server.notify(message);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(server.queuedCount(), 0, `notification unexpectedly produced a response: ${JSON.stringify(message)}`);
}

async function runRequestHandlingTests() {
  const server = startServer(null, path.join(tempRoot, "request-handling.jsonl"));
  try {
    for (const malformed of [null, [], 7, "raw", {}, { jsonrpc: "2.0" }, { jsonrpc: "2.0", method: 7 }]) {
      assertProtocolError(await server.request(malformed), -32600);
    }
    await expectNoResponse(server, {
      jsonrpc: "2.0", method: "initialize",
      params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "notification-test", version: "0.1.0" } }
    });
    assertProtocolError(await server.request({ jsonrpc: "2.0", id: 1, method: "tools/list" }), -32002);
    assertProtocolError(await server.request({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "add", arguments: { a: 2, b: 3 } } }), -32002);
    await expectNoResponse(server, { jsonrpc: "2.0", method: "notifications/initialized" });
    assertProtocolError(await server.request({ jsonrpc: "2.0", id: 3, method: "tools/list" }), -32002);
    assertProtocolError(await server.request({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "add", arguments: { a: 2, b: 3 } } }), -32002);

    const initialized = await server.request({
      jsonrpc: "2.0", id: 5, method: "initialize",
      params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "request-test", version: "0.1.0" } }
    });
    assert.equal(initialized.result.protocolVersion, "2025-11-25");
    await expectNoResponse(server, { jsonrpc: "2.0", method: "notifications/initialized" });
    const listed = await server.request({ jsonrpc: "2.0", id: 6, method: "tools/list", params: {} });
    const listedNames = listed.result.tools.map((tool) => tool.name);
    assert.equal(listedNames.length, 22);
    for (const name of ["add", "project_info", "read_source", "search", "start", "inspect", "review", "status", "check", "test", "doctor", "release_check", "evidence", "adapter", "handoff", "init", "pipeline", "journal", "session_status"]) {
      assert.equal(listedNames.includes(name), true, name);
    }
    assert.equal(listedNames.includes("safe_push"), false);
    const blocked = await server.request({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "add", arguments: { a: 2, b: 3 } } });
    assert.equal(blocked.result.isError, true);
    assert.equal(blocked.result.structuredContent.error.code, "FREELANG_RUNNER_UNAVAILABLE");
  } finally {
    await server.close();
  }
}

async function runIntegrationTests(runner) {
  const first = startServer(runner, logFile);
  const initialized = await first.request({
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "freelang-mcp-test-client", version: "0.1.0" } }
  });
  assert.equal(initialized.result.protocolVersion, "2025-11-25");
  assert.deepEqual(initialized.result.capabilities.tools, { listChanged: false });
  await first.notify({ jsonrpc: "2.0", method: "notifications/initialized" });

  const listed = await first.request({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  assert.equal(listed.result.tools.length, 22);
  assert.deepEqual(listed.result.tools[0].inputSchema.required, ["a", "b"]);
  assert.equal(listed.result.tools[0].inputSchema.additionalProperties, false);
  assert.equal(listed.result.tools[0].inputSchema.properties.a.type, "number");
  assert.equal(listed.result.tools[0].inputSchema.properties.b.type, "number");

  const addResponse = await first.request({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "add", arguments: { a: 2, b: 3 } } });
  const direct = runAdd(2, 3);
  assert.equal(direct.ok, true, JSON.stringify(direct));
  assertAddResponse(addResponse, 3, direct.result);
  const info = await first.request({ jsonrpc: "2.0", id: 17, method: "tools/call", params: { name: "project_info", arguments: {} } });
  assert.equal(info.result.isError, false);
  assert.equal(info.result.structuredContent.project, "freelang-mcp");
  assert.equal(info.result.structuredContent.protocolVersion, "2025-11-25");
  assert.equal(info.result.structuredContent.transport, "stdio");
  assert.deepEqual(info.result.structuredContent.tools, listed.result.tools.map((tool) => tool.name));
  const source = await first.request({ jsonrpc: "2.0", id: 18, method: "tools/call", params: { name: "read_source", arguments: { path: "mcp/README.md", startLine: 1, endLine: 1 } } });
  assert.equal(source.result.isError, false);
  assert.equal(source.result.structuredContent.path, "mcp/README.md");
  const search = await first.request({ jsonrpc: "2.0", id: 19, method: "tools/call", params: { name: "search", arguments: { query: "project_info", path: "mcp/registry.mjs" } } });
  assert.equal(search.result.isError, false);
  assert.ok(search.result.structuredContent.matches.length >= 1);
  const traversal = await first.request({ jsonrpc: "2.0", id: 20, method: "tools/call", params: { name: "read_source", arguments: { path: "../README.md" } } });
  assert.equal(traversal.result.isError, true);
  const invalid = await first.request({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "add", arguments: { a: "two", b: 3 } } });
  assert.equal(invalid.result.isError, true);
  assert.match(invalid.result.content[0].text, /numbers/);
  assertAddResponse(await first.request({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "add", arguments: { a: 10, b: -4 } } }), 5, 6);
  const unknown = await first.request({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "missing", arguments: {} } });
  assert.equal(unknown.error.code, -32602);
  assertAddResponse(await first.request({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "add", arguments: { a: 0, b: 0 } } }), 7, 0);
  for (const [id, argumentsValue] of [[8, { a: "2", b: 3 }], [9, { a: 2 }], [12, { a: 2, b: 3, extra: 1 }]]) {
    const invalidInput = await first.request({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "add", arguments: argumentsValue } });
    assert.equal(invalidInput.result.isError, true);
    assert.equal(invalidInput.result.structuredContent.error.code, "INVALID_INPUT");
  }
  const overflow = await first.request({ jsonrpc: "2.0", id: 13, method: "tools/call", params: { name: "add", arguments: { a: 1e308, b: 1e308 } } });
  const directOverflow = runAdd(1e308, 1e308);
  assert.equal(directOverflow.ok, false);
  assert.equal(overflow.result.isError, true);
  assert.equal(overflow.result.structuredContent.error.code, directOverflow.error.code);
  for (const [id, name] of [[14, "status"], [15, "check"], [16, "test"]]) {
    const projectResult = await first.request({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: { project: "." } } });
    assert.equal(projectResult.result.isError, false, JSON.stringify(projectResult));
    assert.equal(projectResult.result.structuredContent.status, "PASS", JSON.stringify(projectResult));
    assert.match(projectResult.result.structuredContent.output, /PROJECT=freelang-mcp|FREELANG_(CHECK|TEST)=PASS/);
  }
  await first.close();

  const second = startServer(runner, logFile);
  await second.request({ jsonrpc: "2.0", id: 10, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "freelang-mcp-test-client", version: "0.1.0" } } });
  await second.notify({ jsonrpc: "2.0", method: "notifications/initialized" });
  assertAddResponse(await second.request({ jsonrpc: "2.0", id: 11, method: "tools/call", params: { name: "add", arguments: { a: 4, b: 1 } } }), 11, 5);
  await second.close();

  const records = fs.readFileSync(logFile, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.deepEqual(records.map((record) => record.requestId), [3, 17, 18, 19, 20, 4, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 11]);
  for (const record of records) {
    assert.equal(["add", "project_info", "read_source", "search", "missing", "status", "check", "test"].includes(record.toolName), true);
    assert.equal(typeof record.success, "boolean");
    assert.equal(typeof record.durationMs, "number");
    assert.equal(Object.prototype.hasOwnProperty.call(record, "arguments"), false);
  }
  assert.equal(records.filter((record) => record.success).length, 10);
  assert.equal(records.filter((record) => !record.success).length, 7);
  console.log("MCP_CLIENT_INTEGRATION=PASS");
  console.log("MCP_PROTOCOL=2025-11-25");
  console.log("MCP_CALL_RESULT=5");
  console.log("MCP_RECONNECT=PASS");
  console.log("MCP_AUDIT_CORRELATION=PASS");
  console.log("MCP_TOOL_COVERAGE=PASS");
  console.log("MCP_FREELANG_MATCH=PASS");
}

const runner = resolveRunner();
let status = 0;
try {
  await runRequestHandlingTests();
  console.log("MCP_REQUEST_HANDLING=PASS");
  if (!runner) {
    console.log("MCP_INTEGRATION=BLOCKED");
    console.log("MCP_BLOCK_REASON=FreeLang Script runner not found; set FREELANG_SCRIPT_RUNNER or FREELANG_SCRIPT_ROOT");
    status = 2;
  } else {
    await runIntegrationTests(runner);
    console.log("MCP_INTEGRATION=PASS");
  }
} finally {
  await Promise.allSettled([...activeServers].map((server) => server.close()));
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
process.exitCode = status;
