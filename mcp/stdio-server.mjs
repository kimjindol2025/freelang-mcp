#!/usr/bin/env node
import readline from "node:readline";
import { SERVER_INFO, PROTOCOL_VERSION, listTools } from "./registry.mjs";
import { handleToolCall } from "./service.mjs";

const cwd = process.cwd();
const CONNECTION_STATE = Object.freeze({
  PRE_INITIALIZE: "pre-initialize",
  INITIALIZE_RESPONDED: "initialize-responded",
  INITIALIZED: "initialized"
});
let connectionState = CONNECTION_STATE.PRE_INITIALIZE;
let shutdownRequested = false;

function hasOwn(value, key) {
  return value !== null && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, key);
}

function requestId(value) {
  return hasOwn(value, "id") ? value.id : null;
}

function isRequestObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidRequest(value) {
  return isRequestObject(value) && value.jsonrpc === "2.0" && typeof value.method === "string";
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function errorResponse(id, code, message, data) {
  const response = { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
  if (data !== undefined) response.error.data = data;
  return response;
}

function initializeResponse(request) {
  if (connectionState !== CONNECTION_STATE.PRE_INITIALIZE) {
    return errorResponse(requestId(request), -32000, "Server has already processed initialize");
  }
  const requested = request.params?.protocolVersion;
  const selected = requested === PROTOCOL_VERSION ? requested : PROTOCOL_VERSION;
  connectionState = CONNECTION_STATE.INITIALIZE_RESPONDED;
  return {
    jsonrpc: "2.0",
    id: requestId(request),
    result: {
      protocolVersion: selected,
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
      instructions: "Call the add tool with numeric a and b values."
    }
  };
}

function requireInitialized(request) {
  return connectionState === CONNECTION_STATE.INITIALIZED
    ? null
    : errorResponse(requestId(request), -32002, "Server requires initialize followed by notifications/initialized");
}

function dispatch(request) {
  if (!isValidRequest(request)) return errorResponse(requestId(request), -32600, "Invalid Request");
  if (request.method === "initialize") {
    if (!hasOwn(request, "id")) return null;
    return initializeResponse(request);
  }
  if (request.method === "notifications/initialized") {
    if (connectionState === CONNECTION_STATE.INITIALIZE_RESPONDED) {
      connectionState = CONNECTION_STATE.INITIALIZED;
    }
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
  if (request.method === "tools/call") return handleToolCall(request, cwd, { protocolVersion: PROTOCOL_VERSION, transport: "stdio" });
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
  if (!isValidRequest(request)) {
    send(errorResponse(requestId(request), -32600, "Invalid Request"));
    return;
  }
  try {
    const response = dispatch(request);
    if (response && hasOwn(request, "id")) send(response);
  } catch (error) {
    process.stderr.write(`MCP_INTERNAL_ERROR ${error.message}\n`);
    if (hasOwn(request, "id")) send(errorResponse(requestId(request), -32603, "Internal error"));
  }
});

input.on("close", () => process.exit(0));
