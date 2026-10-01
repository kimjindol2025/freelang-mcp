import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MAX_OUTPUT_BYTES = 64 * 1024;
const TIMEOUT_MS = 60_000;

const PROJECT_COMMANDS = Object.freeze({
  start: { script: "fl-start" },
  inspect: { script: "fl-inspect" },
  review: { script: "fl-review" },
  report: { script: "fl-report" },
  detect: { script: "fl-detect" },
  status: { script: "fl-status" },
  check: { script: "fl-check" },
  test: { script: "fl-test", args: () => ["--auto"] },
  route: { script: "fl-route" },
  doctor: { script: "fl-doctor" },
  release_check: { script: "fl-release-check" },
  evidence: { script: "fl-evidence", args: () => ["--json"] },
  adapter: { script: "fl-adapter", args: () => ["list"] },
  handoff: { script: "fl-handoff", mutating: true },
  init: { script: "fl-init", mutating: true },
  pipeline: { script: "fl-pipeline", mutating: true },
  journal: { script: "fl-journal", mutating: true },
  session_status: { script: "fl-session", args: () => ["status"], session: true }
});

export const PROJECT_TOOL_NAMES = Object.freeze(Object.keys(PROJECT_COMMANDS));

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
  let canonical;
  try { canonical = fs.realpathSync(resolved); } catch {
    return { ok: false, error: { code: "PROJECT_NOT_FOUND", message: `project directory not found: ${project}` } };
  }
  const canonicalWorkspace = fs.realpathSync(workspace);
  const canonicalRelative = path.relative(canonicalWorkspace, canonical);
  if (canonicalRelative === ".." || canonicalRelative.startsWith(`..${path.sep}`) || path.isAbsolute(canonicalRelative)) {
    return { ok: false, error: { code: "PROJECT_SCOPE_DENIED", message: "project must stay inside the MCP workspace" } };
  }
  if (!fs.statSync(canonical).isDirectory()) {
    return { ok: false, error: { code: "PROJECT_NOT_FOUND", message: `project directory not found: ${project}` } };
  }
  return { ok: true, project: relative || ".", resolved: canonical };
}

function trimOutput(value) {
  const output = String(value || "");
  if (Buffer.byteLength(output) <= MAX_OUTPUT_BYTES) return output;
  return `${output.slice(0, MAX_OUTPUT_BYTES)}\n[output truncated]`;
}

function commandArgs(name, definition, target, options) {
  if (name === "journal") {
    const operation = options.operation || "show";
    if (operation === "add") return ["add", options.message];
    return [operation];
  }
  if (name === "pipeline") return [target.resolved];
  return [...(definition.args ? definition.args(options) : []), ...(definition.session ? [] : [target.resolved])];
}

export function projectToolDefinition(name) {
  return PROJECT_COMMANDS[name] || null;
}

export function runProjectTool(name, cwd, options = {}) {
  const definition = PROJECT_COMMANDS[name];
  if (!definition) return { ok: false, error: { code: "UNKNOWN_PROJECT_TOOL", message: `unknown project tool: ${name}` } };
  const target = resolveProject(cwd, options.project || ".");
  if (!target.ok) return target;
  const journalReadOnly = name === "journal" && (options.operation || "show") === "show";
  if (definition.mutating && !journalReadOnly && options.confirm !== true) {
    return { ok: false, project: target.project, error: { code: "APPROVAL_REQUIRED", message: `${name} requires confirm=true` } };
  }
  if (name === "journal" && options.operation === "add" && typeof options.message !== "string") {
    return { ok: false, project: target.project, error: { code: "INVALID_INPUT", message: "journal add requires message" } };
  }
  if (name === "journal" && !["show", "init", "add"].includes(options.operation || "show")) {
    return { ok: false, project: target.project, error: { code: "INVALID_INPUT", message: "journal operation must be show, init, or add" } };
  }
  if (name === "pipeline" && options.deploy === true) {
    return { ok: false, project: target.project, error: { code: "DEPLOY_NOT_EXPOSED", message: "deploy is intentionally not exposed through MCP" } };
  }

  const script = path.join(ROOT, "scripts", definition.script);
  const args = commandArgs(name, definition, target, options);
  const executionCwd = definition.session || name === "journal" ? target.resolved : ROOT;
  const result = spawnSync(script, args, {
    cwd: executionCwd,
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
  const status = result.status === 0 ? "PASS" : result.status === 2 ? "BLOCKED" : "FAIL";
  return {
    ok: result.status === 0,
    project: target.project,
    status,
    exitCode: result.status,
    output,
    error: result.status === 0 ? undefined : { code: status === "BLOCKED" ? "PROJECT_TOOL_BLOCKED" : "PROJECT_TOOL_FAILED", message: `${name} exited with code ${result.status}` }
  };
}
