#!/usr/bin/env node
import readline from "node:readline";
import { performance } from "node:perf_hooks";
import { SERVER_INFO, PROTOCOL_VERSION, getTool, listTools } from "./registry.mjs";
import { authorizeTool, validateArguments } from "./policy.mjs";
import { runAdd } from "./runner.mjs";
import { writeAudit } from "./audit.mjs";

const cwd = process.cwd();
let initialized = false;
let shutdownRequested = false;

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function errorResponse(id, code, message, data) {
  const response = { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
  if (data !== undefined) response.error.data = data;
  return response;
}

function textResult(text, isError = false, structuredContent) {
  const result = { content: [{ type: "text", text: String(text) }], isError };
  if (structuredContent !== undefined) result.structuredContent = structuredContent;
  return result;
}

function recordTool(request, toolName, success, startedAt, errorCode = null) {
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

function initializeResponse(request) {
  const requested = request.params?.protocolVersion;
  const selected = requested === PROTOCOL_VERSION ? requested : PROTOCOL_VERSION;
  return {
    jsonrpc: "2.0",
    id: request.id ?? null,
    result: {
      protocolVersion: selected,
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
      instructions: "Call the add tool with numeric a and b values."
    }
  };
}

function requireInitialized(request) {
  return initialized ? null : errorResponse(request.id, -32002, "Server is not initialized");
}

function handleToolCall(request) {
  const startedAt = performance.now();
  const params = request.params;
  const toolName = params && typeof params === "object" ? params.name : null;
  const args = params && typeof params === "object" ? params.arguments : undefined;

  if (typeof toolName !== "string") {
    recordTool(request, null, false, startedAt, "INVALID_REQUEST");
    return errorResponse(request.id, -32602, "tools/call requires params.name");
  }
  if (!getTool(toolName)) {
    recordTool(request, toolName, false, startedAt, "UNKNOWN_TOOL");
    return errorResponse(request.id, -32602, `Unknown tool: ${toolName}`);
  }
  const permission = authorizeTool(toolName);
  if (!permission.allowed) {
    recordTool(request, toolName, false, startedAt, permission.code);
    return { jsonrpc: "2.0", id: request.id ?? null, result: textResult(permission.message, true) };
  }
  const validation = validateArguments(args);
  if (!validation.ok) {
    recordTool(request, toolName, false, startedAt, validation.code);
    return { jsonrpc: "2.0", id: request.id ?? null, result: textResult(validation.message, true, { error: { code: validation.code, message: validation.message } }) };
  }

  const result = runAdd(args.a, args.b, { cwd });
  if (!result.ok) {
    recordTool(request, toolName, false, startedAt, result.error.code);
    return { jsonrpc: "2.0", id: request.id ?? null, result: textResult(result.error.message, true, { error: result.error }) };
  }
  recordTool(request, toolName, true, startedAt);
  return {
    jsonrpc: "2.0",
    id: request.id ?? null,
    result: textResult(String(result.result), false, { result: result.result })
  };
}

function dispatch(request) {
  if (!request || typeof request !== "object" || request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    return errorResponse(request?.id, -32600, "Invalid Request");
  }
  if (request.method === "initialize") return initializeResponse(request);
  if (request.method === "notifications/initialized") {
    initialized = true;
    return null;
  }
  if (request.method === "ping") return { jsonrpc: "2.0", id: request.id ?? null, result: {} };
  if (request.method === "shutdown") {
    shutdownRequested = true;
    return { jsonrpc: "2.0", id: request.id ?? null, result: null };
  }
  if (request.method === "exit") {
    process.exit(shutdownRequested ? 0 : 1);
  }
  if (request.method === "server/discover") {
    return errorResponse(request.id, -32601, "Modern MCP discovery is not supported; use legacy 2025-11-25 initialize", { supported: [PROTOCOL_VERSION] });
  }
  const initializationError = requireInitialized(request);
  if (initializationError) return initializationError;
  if (request.method === "tools/list") {
    return { jsonrpc: "2.0", id: request.id ?? null, result: { tools: listTools() } };
  }
  if (request.method === "tools/call") return handleToolCall(request);
  if (request.method.startsWith("notifications/")) return null;
  return errorResponse(request.id, -32601, `Method not found: ${request.method}`);
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  if (!line.trim()) return;
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    send(errorResponse(null, -32700, "Parse error"));
    return;
  }
  try {
    const response = dispatch(request);
    if (response && request.id !== undefined) send(response);
  } catch (error) {
    process.stderr.write(`MCP_INTERNAL_ERROR ${error.message}\n`);
    if (request.id !== undefined) send(errorResponse(request.id, -32603, "Internal error"));
  }
});

input.on("close", () => process.exit(0));
