import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SCRIPT_FILE = path.join(ROOT, "mcp", "core", "add.fls");

export function runnerCandidates(env = process.env) {
  if (env.FREELANG_SCRIPT_RUNNER) return [env.FREELANG_SCRIPT_RUNNER];
  return [
    env.FREELANG_SCRIPT_ROOT ? path.join(env.FREELANG_SCRIPT_ROOT, "bin", "fl-script-unified.js") : null,
    path.join(ROOT, "..", "freelang-script", "bin", "fl-script-unified.js"),
    "/root/freelang-script/bin/fl-script-unified.js",
    "/root/lang/freelang-script/bin/fl-script-unified.js"
  ].filter(Boolean);
}

export function resolveRunner(env = process.env) {
  return runnerCandidates(env).find((candidate) => fs.existsSync(candidate)) || null;
}

function parseLastJson(stdout) {
  const lines = String(stdout).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch {
      // The runner may emit diagnostic lines; only the final JSON envelope matters.
    }
  }
  return null;
}

export function runAdd(a, b, options = {}) {
  const runner = resolveRunner();
  if (!runner) {
    return { ok: false, error: { code: "FREELANG_RUNNER_UNAVAILABLE", message: "FreeLang Script runner not found" } };
  }
  const timeoutMs = options.timeoutMs || Number(process.env.FREELANG_SCRIPT_TIMEOUT_MS || 15000);
  const result = spawnSync(process.execPath, [runner, "run", SCRIPT_FILE, "--", String(a), String(b)], {
    cwd: options.cwd || ROOT,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024
  });
  if (result.error) {
    if (result.error.code === "ETIMEDOUT") {
      return { ok: false, error: { code: "FREELANG_EXECUTION_TIMEOUT", message: `FreeLang Script execution timed out after ${timeoutMs}ms` } };
    }
    return { ok: false, error: { code: "FREELANG_EXECUTION_ERROR", message: result.error.message } };
  }
  const envelope = parseLastJson(result.stdout);
  if (envelope && envelope.ok === true && typeof envelope.result === "number") {
    return { ok: true, result: envelope.result };
  }
  if (envelope && envelope.ok === false && envelope.error) {
    return { ok: false, error: envelope.error };
  }
  if (result.status !== 0) {
    return { ok: false, error: { code: "FREELANG_EXECUTION_ERROR", message: "FreeLang Script execution failed" } };
  }
  return { ok: false, error: { code: "FREELANG_INVALID_RESULT", message: "FreeLang Script returned an invalid result" } };
}
