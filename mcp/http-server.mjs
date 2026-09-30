#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SERVER_INFO, MODERN_PROTOCOL_VERSION, listTools } from "./registry.mjs";
import { handleToolCall } from "./service.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_PORT = 41951;
const DEFAULT_MAX_BODY_BYTES = 64 * 1024;
const HEADER_MISMATCH = -32020;
const UNSUPPORTED_PROTOCOL = -32022;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function jsonRpcError(id, code, message, data) {
  const response = { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
  if (data !== undefined) response.error.data = data;
  return response;
}

function isLoopbackHost(host) {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

function decodeHeaderValue(value) {
  if (typeof value !== "string") return null;
  if (!value.startsWith("=?base64?") || !value.endsWith("?=")) return value;
  try {
    return Buffer.from(value.slice(9, -2), "base64").toString("utf8");
  } catch {
    return null;
  }
}

function parseAllowedOrigins(env) {
  const configured = String(env.MCP_HTTP_ALLOWED_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean);
  return new Set(configured.length ? configured : [
    "http://127.0.0.1",
    "http://localhost",
    "https://127.0.0.1",
    "https://localhost"
  ]);
}

export function httpConfigFromEnv(env = process.env) {
  const host = env.MCP_HTTP_HOST || "127.0.0.1";
  const port = Number(env.MCP_HTTP_PORT || DEFAULT_PORT);
  const maxBodyBytes = Number(env.MCP_HTTP_MAX_BODY_BYTES || DEFAULT_MAX_BODY_BYTES);
  const token = env.MCP_HTTP_BEARER_TOKEN || "";
  const tlsCert = env.MCP_HTTP_TLS_CERT || "";
  const tlsKey = env.MCP_HTTP_TLS_KEY || "";

  if (!token) throw new Error("MCP_HTTP_BEARER_TOKEN is required");
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("MCP_HTTP_PORT must be 0..65535");
  if (!Number.isInteger(maxBodyBytes) || maxBodyBytes < 1) throw new Error("MCP_HTTP_MAX_BODY_BYTES must be a positive integer");
  if ((tlsCert && !tlsKey) || (!tlsCert && tlsKey)) throw new Error("MCP_HTTP_TLS_CERT and MCP_HTTP_TLS_KEY must be provided together");
  if (!isLoopbackHost(host) && (!tlsCert || !tlsKey)) throw new Error("non-loopback HTTP requires TLS certificate and key");
  if (tlsCert && !fs.existsSync(tlsCert)) throw new Error(`TLS certificate not found: ${tlsCert}`);
  if (tlsKey && !fs.existsSync(tlsKey)) throw new Error(`TLS key not found: ${tlsKey}`);

  return {
    host,
    port,
    maxBodyBytes,
    token,
    tlsCert,
    tlsKey,
    allowedOrigins: parseAllowedOrigins(env),
    cwd: env.MCP_HTTP_CWD || ROOT
  };
}

function sendJson(response, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
    "Content-Length": Buffer.byteLength(body)
  });
  response.end(body);
}

function sendError(response, status, id, code, message, data) {
  sendJson(response, status, jsonRpcError(id, code, message, data));
}

function sendAccepted(response) {
  response.writeHead(202, { "Content-Length": "0" });
  response.end();
}

function requestMeta(request) {
  if (isObject(request.params) && isObject(request.params._meta)) return request.params._meta;
  if (isObject(request._meta)) return request._meta;
  return null;
}

function validateRequestHeaders(request, headers) {
  const meta = requestMeta(request);
  const versionHeader = headers["mcp-protocol-version"];
  const methodHeader = headers["mcp-method"];

  if (versionHeader !== MODERN_PROTOCOL_VERSION) {
    return {
      status: 400,
      response: jsonRpcError(request.id, UNSUPPORTED_PROTOCOL, "Unsupported MCP protocol version", { supported: [MODERN_PROTOCOL_VERSION] })
    };
  }
  if (!meta || meta["io.modelcontextprotocol/protocolVersion"] !== versionHeader) {
    return {
      status: 400,
      response: jsonRpcError(request.id, HEADER_MISMATCH, "Header mismatch: protocol version does not match request metadata")
    };
  }
  if (methodHeader !== request.method) {
    return {
      status: 400,
      response: jsonRpcError(request.id, HEADER_MISMATCH, "Header mismatch: Mcp-Method does not match request method")
    };
  }

  const bodyName = request.method === "tools/call" && isObject(request.params) ? request.params.name : null;
  const nameHeader = headers["mcp-name"];
  if (bodyName !== null) {
    if (typeof bodyName !== "string" || !nameHeader || decodeHeaderValue(nameHeader) !== bodyName) {
      return {
        status: 400,
        response: jsonRpcError(request.id, HEADER_MISMATCH, "Header mismatch: Mcp-Name does not match tool name")
      };
    }
  } else if (nameHeader !== undefined) {
    return {
      status: 400,
      response: jsonRpcError(request.id, HEADER_MISMATCH, "Header mismatch: Mcp-Name is not valid for this method")
    };
  }
  return null;
}

function isJsonRpcRequest(value) {
  return isObject(value) && value.jsonrpc === "2.0" && typeof value.method === "string";
}

function discoverResponse(request) {
  return {
    jsonrpc: "2.0",
    id: request.id ?? null,
    result: {
      supportedVersions: [MODERN_PROTOCOL_VERSION],
      capabilities: { tools: { listChanged: false } },
      instructions: "Call the add tool with numeric a and b values.",
      _meta: { "io.modelcontextprotocol/serverInfo": SERVER_INFO }
    }
  };
}

function dispatchModern(request, cwd) {
  if (request.method === "server/discover") return discoverResponse(request);
  if (request.method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id: request.id ?? null,
      result: { resultType: "complete", tools: listTools(), ttlMs: 300000, cacheScope: "public" }
    };
  }
  if (request.method === "tools/call") {
    const response = handleToolCall(request, cwd);
    if (response.result) response.result.resultType = "complete";
    return response;
  }
  if (request.method === "initialize" || request.method === "notifications/initialized") {
    return jsonRpcError(request.id, -32601, "Modern MCP does not use initialize or initialized");
  }
  return jsonRpcError(request.id, -32601, `Method not found: ${request.method}`);
}

async function readBody(request, maxBytes) {
  const length = Number(request.headers["content-length"] || 0);
  if (Number.isFinite(length) && length > maxBytes) {
    request.resume();
    const error = new Error("request body too large");
    error.code = "BODY_TOO_LARGE";
    throw error;
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (tooLarge) {
        const error = new Error("request body too large");
        error.code = "BODY_TOO_LARGE";
        reject(error);
        return;
      }
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", reject);
  });
}

function createRequestHandler(config) {
  return async (request, response) => {
    const url = new URL(request.url || "/", "http://mcp.local");
    if (url.pathname !== "/mcp") {
      sendError(response, 404, null, -32601, "MCP endpoint not found");
      return;
    }
    if (request.method !== "POST") {
      sendError(response, 405, null, -32601, "MCP endpoint only accepts POST", { allow: "POST" });
      return;
    }
    const origin = request.headers.origin;
    if (origin && !config.allowedOrigins.has(origin)) {
      sendError(response, 403, null, -32003, "Origin is not allowed");
      return;
    }
    if (request.headers.authorization !== `Bearer ${config.token}`) {
      sendError(response, 401, null, -32001, "Authentication required");
      return;
    }
    const accept = String(request.headers.accept || "");
    if (!accept.includes("application/json") || !accept.includes("text/event-stream")) {
      sendError(response, 406, null, -32600, "Accept must include application/json and text/event-stream");
      return;
    }
    if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
      sendError(response, 415, null, -32600, "Content-Type must be application/json");
      return;
    }

    let body;
    try {
      body = JSON.parse(await readBody(request, config.maxBodyBytes));
    } catch (error) {
      if (error.code === "BODY_TOO_LARGE") {
        sendError(response, 413, null, -32600, "Request body exceeds configured limit");
      } else {
        sendError(response, 400, null, -32700, "Parse error");
      }
      return;
    }
    if (!isJsonRpcRequest(body)) {
      sendError(response, 400, null, -32600, "Invalid Request");
      return;
    }
    const headerError = validateRequestHeaders(body, request.headers);
    if (headerError) {
      sendJson(response, headerError.status, headerError.response);
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(body, "id")) {
      sendAccepted(response);
      return;
    }
    sendJson(response, 200, dispatchModern(body, config.cwd));
  };
}

export function createHttpServer(config) {
  const handler = createRequestHandler(config);
  if (config.tlsCert && config.tlsKey) {
    return https.createServer({ key: fs.readFileSync(config.tlsKey), cert: fs.readFileSync(config.tlsCert) }, handler);
  }
  return http.createServer(handler);
}

export function startHttpServer(config = httpConfigFromEnv()) {
  const server = createHttpServer(config);
  server.listen(config.port, config.host, () => {
    const scheme = config.tlsCert ? "https" : "http";
    process.stdout.write(`MCP_HTTP_PROTOCOL=${MODERN_PROTOCOL_VERSION}\n`);
    process.stdout.write(`MCP_HTTP_LISTENING=${scheme}://${config.host}:${server.address().port}/mcp\n`);
  });
  const close = () => server.close(() => process.exit(0));
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    startHttpServer();
  } catch (error) {
    process.stderr.write(`MCP_HTTP_STARTUP=BLOCKED ${error.message}\n`);
    process.exitCode = 2;
  }
}
