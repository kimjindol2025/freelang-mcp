import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MAX_OUTPUT_BYTES = 64 * 1024;
const TIMEOUT_MS = 60_000;

const COMMANDS = Object.freeze({
  status: "fl-status",
  check: "fl-check",
  test: "fl-test"
});

function resolveProject(cwd, project = ".") {
  if (typeof project !== "string" || project.length === 0 || project.includes("\0")) {
    return { ok: false, error: { code: "INVALID_INPUT", message: "project must be a non-empty relative path" } };
  }
  if (path.isAbsolute(project)) {
    return { ok: false, error: { code: "PROJECT_SCOPE_DENIED", message: "project must be relative to the MCP workspace" } };
  }
  const workspace = path.resolve(cwd);
  const resolved = path.resolve(workspace, project);
  const relative = path.relative(workspace, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return { ok: false, error: { code: "PROJECT_SCOPE_DENIED", message: "project must stay inside the MCP workspace" } };
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    return { ok: false, error: { code: "PROJECT_NOT_FOUND", message: `project directory not found: ${project}` } };
  }
  return { ok: true, project: relative || ".", resolved };
}

function trimOutput(value) {
  const output = String(value || "");
  if (Buffer.byteLength(output) <= MAX_OUTPUT_BYTES) return output;
  return `${output.slice(0, MAX_OUTPUT_BYTES)}\n[output truncated]`;
}

export function runProjectTool(name, cwd, project = ".") {
  const command = COMMANDS[name];
  if (!command) return { ok: false, error: { code: "UNKNOWN_PROJECT_TOOL", message: `unknown project tool: ${name}` } };
  const target = resolveProject(cwd, project);
  if (!target.ok) return target;

  const script = path.join(ROOT, "scripts", command);
  const args = name === "test" ? ["--auto", target.resolved] : [target.resolved];
  const result = spawnSync(script, args, {
    cwd: ROOT,
    env: process.env,
    encoding: "utf8",
    timeout: TIMEOUT_MS,
    maxBuffer: MAX_OUTPUT_BYTES
  });
  if (result.error) {
    const code = result.error.code === "ETIMEDOUT" ? "PROJECT_TOOL_TIMEOUT" : "PROJECT_TOOL_EXECUTION_ERROR";
    return { ok: false, project: target.project, error: { code, message: result.error.message } };
  }
  const output = trimOutput(`${result.stdout || ""}${result.stderr ? `\n${result.stderr}` : ""}`.trim());
  return {
    ok: result.status === 0,
    project: target.project,
    status: result.status === 0 ? "PASS" : "FAIL",
    exitCode: result.status,
    output,
    error: result.status === 0 ? undefined : { code: "PROJECT_TOOL_FAILED", message: `${name} exited with code ${result.status}` }
  };
}
