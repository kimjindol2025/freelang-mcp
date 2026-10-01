import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { authorizeTool } from "../policy.mjs";
import { runProjectTool } from "../project-tools.mjs";
import { listTools } from "../registry.mjs";
import { handleToolCall } from "../service.mjs";
import { projectInfo, readSource, searchSource } from "../source-tools.mjs";

const ROOT = path.resolve(new URL("../..", import.meta.url).pathname);

test("source and project tools reject symlinks outside the workspace", (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "fl-mcp-scope-"));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const workspace = path.join(fixture, "workspace");
  const outsideProject = path.join(fixture, "outside-project");
  fs.mkdirSync(workspace);
  fs.mkdirSync(outsideProject);
  fs.writeFileSync(path.join(fixture, "outside.txt"), "outside marker\n");
  fs.writeFileSync(path.join(workspace, "inside.txt"), "inside marker\n");
  fs.symlinkSync(path.join(fixture, "outside.txt"), path.join(workspace, "outside.txt"));
  fs.symlinkSync(outsideProject, path.join(workspace, "outside-project"));
  fs.symlinkSync(path.join(workspace, "inside.txt"), path.join(workspace, "inside-link.txt"));

  assert.equal(readSource(workspace, { path: "outside.txt" }).error.code, "SOURCE_SCOPE_DENIED");
  assert.equal(searchSource(workspace, { query: "outside", path: "outside.txt" }).error.code, "SOURCE_SCOPE_DENIED");
  assert.equal(runProjectTool("status", workspace, { project: "outside-project" }).error.code, "PROJECT_SCOPE_DENIED");
  assert.equal(readSource(workspace, { path: "inside-link.txt" }).value.content, "inside marker\n");
});

test("MCP does not expose push and does not mark project commands read-only", () => {
  const tools = listTools();
  assert.equal(tools.some((tool) => tool.name === "safe_push"), false);
  assert.equal(authorizeTool("safe_push").allowed, false);
  assert.equal(runProjectTool("safe_push", ROOT, { confirm: true }).error.code, "UNKNOWN_PROJECT_TOOL");
  for (const name of ["init", "handoff", "pipeline", "journal", "test"]) {
    const tool = tools.find((entry) => entry.name === name);
    assert.equal(tool.annotations.readOnlyHint, false, name);
  }
  for (const name of ["init", "handoff", "pipeline", "journal"]) {
    const tool = tools.find((entry) => entry.name === name);
    assert.equal(tool.annotations.destructiveHint, true, name);
  }
});

test("exit code 2 remains BLOCKED in the MCP tool response", (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "fl-mcp-blocked-"));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const oldRunner = process.env.FREELANG_AFJ_RUNNER;
  const oldAudit = process.env.MCP_EXECUTION_LOG;
  process.env.FREELANG_AFJ_RUNNER = path.join(fixture, "missing-afj.js");
  process.env.MCP_EXECUTION_LOG = path.join(fixture, "audit.jsonl");
  t.after(() => {
    if (oldRunner === undefined) delete process.env.FREELANG_AFJ_RUNNER;
    else process.env.FREELANG_AFJ_RUNNER = oldRunner;
    if (oldAudit === undefined) delete process.env.MCP_EXECUTION_LOG;
    else process.env.MCP_EXECUTION_LOG = oldAudit;
  });
  const response = handleToolCall({ id: 42, params: { name: "test", arguments: { project: "." } } }, ROOT);
  assert.equal(response.result.isError, true);
  assert.equal(response.result.structuredContent.status, "BLOCKED");
  assert.equal(response.result.structuredContent.exitCode, 2);
  assert.equal(response.result.structuredContent.error.code, "PROJECT_TOOL_BLOCKED");
  assert.match(response.result.structuredContent.output, /FREELANG_TEST=BLOCKED/);
});

test("project info reports the active transport and complete tool list", () => {
  const expectedTools = listTools().map((tool) => tool.name);
  for (const [transport, protocolVersion] of [["stdio", "2025-11-25"], ["http", "2026-07-28"]]) {
    const info = projectInfo(ROOT, { transport, protocolVersion });
    assert.equal(info.transport, transport);
    assert.equal(info.protocolVersion, protocolVersion);
    assert.deepEqual(info.tools, expectedTools);
  }
});
