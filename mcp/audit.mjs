import fs from "node:fs";
import path from "node:path";

export function auditPath(cwd) {
  return process.env.MCP_EXECUTION_LOG || path.join(cwd, ".freelang", "mcp-executions.jsonl");
}

export function writeAudit(cwd, record) {
  const file = auditPath(cwd);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const safeRecord = {
    timestamp: record.timestamp,
    requestId: record.requestId ?? null,
    toolName: record.toolName ?? null,
    success: Boolean(record.success),
    durationMs: Number(record.durationMs),
    errorCode: record.errorCode ?? null
  };
  fs.appendFileSync(file, `${JSON.stringify(safeRecord)}\n`, "utf8");
  return file;
}
