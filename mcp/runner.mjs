import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SCRIPT_FILE = path.join(ROOT, "mcp", "core", "add.fls");

function resolveRunner() {
  const candidates = [
    process.env.FREELANG_SCRIPT_RUNNER,
    process.env.FREELANG_SCRIPT_ROOT ? path.join(process.env.FREELANG_SCRIPT_ROOT, "bin", "fl-script-unified.js") : null,
    path.join(ROOT, "..", "freelang-script", "bin", "fl-script-unified.js"),
    "/root/freelang-script/bin/fl-script-unified.js",
    "/root/lang/freelang-script/bin/fl-script-unified.js"
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
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
  const result = spawnSync(process.execPath, [runner, "run", SCRIPT_FILE, "--", String(a), String(b)], {
    cwd: options.cwd || ROOT,
    encoding: "utf8",
    timeout: options.timeoutMs || 5000,
    maxBuffer: 1024 * 1024
  });
  if (result.error) {
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
