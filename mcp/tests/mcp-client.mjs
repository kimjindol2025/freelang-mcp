import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
const SERVER = path.join(ROOT, "mcp", "stdio-server.mjs");
const RUNNER = "/root/freelang-script/bin/fl-script-unified.js";
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "freelang-mcp-test-"));
const logFile = path.join(tempRoot, "executions.jsonl");

function startServer() {
  const child = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: { ...process.env, FREELANG_SCRIPT_RUNNER: RUNNER, MCP_EXECUTION_LOG: logFile },
    stdio: ["pipe", "pipe", "pipe"]
  });
  let buffer = "";
  const waiters = [];
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    while (buffer.includes("\n")) {
      const index = buffer.indexOf("\n");
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      if (!line.trim()) continue;
      const waiter = waiters.shift();
      if (!waiter) throw new Error(`unexpected server output: ${line}`);
      try { waiter.resolve(JSON.parse(line)); } catch (error) { waiter.reject(error); }
    }
  });
  child.stderr.on("data", () => {});
  function receive(timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("MCP client response timeout")), timeoutMs);
      waiters.push({
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); }
      });
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
  async function close() {
    await request({ jsonrpc: "2.0", id: 99, method: "shutdown" });
    notify({ jsonrpc: "2.0", method: "exit" });
    await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`server exit ${code}`)));
    });
  }
  return { request, notify, close };
}

function assertAddResponse(response, id, expected) {
  assert.equal(response.id, id);
  assert.equal(response.result.isError, false);
  assert.equal(response.result.structuredContent.result, expected);
  assert.equal(response.result.content[0].text, String(expected));
}

try {
  const first = startServer();
  const initialized = await first.request({
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "freelang-mcp-test-client", version: "0.1.0" } }
  });
  assert.equal(initialized.result.protocolVersion, "2025-11-25");
  assert.deepEqual(initialized.result.capabilities.tools, { listChanged: false });
  await first.notify({ jsonrpc: "2.0", method: "notifications/initialized" });

  const listed = await first.request({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), ["add"]);
  assert.deepEqual(listed.result.tools[0].inputSchema.required, ["a", "b"]);

  assertAddResponse(await first.request({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "add", arguments: { a: 2, b: 3 } } }), 3, 5);
  const invalid = await first.request({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "add", arguments: { a: "two", b: 3 } } });
  assert.equal(invalid.result.isError, true);
  assert.match(invalid.result.content[0].text, /numbers/);
  assertAddResponse(await first.request({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "add", arguments: { a: 10, b: -4 } } }), 5, 6);
  const unknown = await first.request({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "missing", arguments: {} } });
  assert.equal(unknown.error.code, -32602);
  assertAddResponse(await first.request({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "add", arguments: { a: 0, b: 0 } } }), 7, 0);
  await first.close();

  const second = startServer();
  await second.request({ jsonrpc: "2.0", id: 10, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "freelang-mcp-test-client", version: "0.1.0" } } });
  await second.notify({ jsonrpc: "2.0", method: "notifications/initialized" });
  assertAddResponse(await second.request({ jsonrpc: "2.0", id: 11, method: "tools/call", params: { name: "add", arguments: { a: 4, b: 1 } } }), 11, 5);
  await second.close();

  const records = fs.readFileSync(logFile, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.deepEqual(records.map((record) => record.requestId), [3, 4, 5, 6, 7, 11]);
  for (const record of records) {
    assert.equal(record.toolName === "add" || record.toolName === "missing", true);
    assert.equal(typeof record.success, "boolean");
    assert.equal(typeof record.durationMs, "number");
    assert.equal(Object.prototype.hasOwnProperty.call(record, "arguments"), false);
  }
  assert.equal(records.filter((record) => record.success).length, 4);
  assert.equal(records.filter((record) => !record.success).length, 2);
  console.log("MCP_CLIENT_INTEGRATION=PASS");
  console.log("MCP_PROTOCOL=2025-11-25");
  console.log("MCP_CALL_RESULT=5");
  console.log("MCP_RECONNECT=PASS");
  console.log("MCP_AUDIT_CORRELATION=PASS");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
