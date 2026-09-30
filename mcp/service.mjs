import { performance } from "node:perf_hooks";
import { getTool } from "./registry.mjs";
import { authorizeTool, validateArguments } from "./policy.mjs";
import { runAdd } from "./runner.mjs";
import { writeAudit } from "./audit.mjs";

function textResult(text, isError = false, structuredContent) {
  const result = { content: [{ type: "text", text: String(text) }], isError };
  if (structuredContent !== undefined) result.structuredContent = structuredContent;
  return result;
}

function recordTool(request, cwd, toolName, success, startedAt, errorCode = null) {
  try {
    writeAudit(cwd, {
      timestamp: new Date().toISOString(),
      requestId: request.id,
      toolName,
      success,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      errorCode
    });
  } catch (error) {
    process.stderr.write(`MCP_AUDIT_WRITE_FAILED ${error.message}\n`);
  }
}

export function handleToolCall(request, cwd) {
  const startedAt = performance.now();
  const params = request.params;
  const toolName = params && typeof params === "object" ? params.name : null;
  const args = params && typeof params === "object" ? params.arguments : undefined;

  if (typeof toolName !== "string") {
    recordTool(request, cwd, null, false, startedAt, "INVALID_REQUEST");
    return { jsonrpc: "2.0", id: request.id ?? null, error: { code: -32602, message: "tools/call requires params.name" } };
  }
  if (!getTool(toolName)) {
    recordTool(request, cwd, toolName, false, startedAt, "UNKNOWN_TOOL");
    return { jsonrpc: "2.0", id: request.id ?? null, error: { code: -32602, message: `Unknown tool: ${toolName}` } };
  }
  const permission = authorizeTool(toolName);
  if (!permission.allowed) {
    recordTool(request, cwd, toolName, false, startedAt, permission.code);
    return { jsonrpc: "2.0", id: request.id ?? null, result: textResult(permission.message, true) };
  }
  const validation = validateArguments(args);
  if (!validation.ok) {
    recordTool(request, cwd, toolName, false, startedAt, validation.code);
    return {
      jsonrpc: "2.0",
      id: request.id ?? null,
      result: textResult(validation.message, true, { error: { code: validation.code, message: validation.message } })
    };
  }

  const result = runAdd(args.a, args.b, { cwd });
  if (!result.ok) {
    recordTool(request, cwd, toolName, false, startedAt, result.error.code);
    return {
      jsonrpc: "2.0",
      id: request.id ?? null,
      result: textResult(result.error.message, true, { error: result.error })
    };
  }
  recordTool(request, cwd, toolName, true, startedAt);
  return {
    jsonrpc: "2.0",
    id: request.id ?? null,
    result: textResult(String(result.result), false, { result: result.result })
  };
}
