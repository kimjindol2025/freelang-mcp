import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { once } from "node:events";
import { test } from "node:test";
import { createHttpServer, httpConfigFromEnv } from "../http-server.mjs";

const TOKEN = "request-test-token";
const MAX_BODY_BYTES = 512;
const discover = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "server/discover",
  params: { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } }
});

function headers(contentType = "application/json") {
  return {
    Authorization: `Bearer ${TOKEN}`,
    Connection: "close",
    Accept: "application/json, text/event-stream",
    "Content-Type": contentType,
    "MCP-Protocol-Version": "2026-07-28",
    "Mcp-Method": "server/discover"
  };
}

function post(port, body, requestHeaders) {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: "127.0.0.1", port, path: "/mcp", method: "POST", headers: requestHeaders }, (response) => {
      let data = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { data += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, body: JSON.parse(data) }));
    });
    request.setTimeout(2000, () => request.destroy(new Error("HTTP request timed out")));
    request.on("error", reject);
    request.end(body);
  });
}

function stalledOversize(port, requestHeaders, firstChunk = "", excessChunk = "", delayMs = 0) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    let output = "";
    let sentExcess = false;
    let respondedBeforeExcess = false;
    let timer;
    const started = Date.now();
    socket.setTimeout(2000, () => socket.destroy(new Error("oversized request held the connection open")));
    socket.on("connect", () => {
      socket.write(`POST /mcp HTTP/1.1\r\nHost: 127.0.0.1\r\n${Object.entries(requestHeaders).map(([key, value]) => `${key}: ${value}\r\n`).join("")}\r\n${firstChunk}`);
      if (excessChunk) {
        timer = setTimeout(() => {
          sentExcess = true;
          socket.write(excessChunk);
        }, delayMs);
      }
    });
    socket.on("data", (chunk) => {
      if (excessChunk && !sentExcess) respondedBeforeExcess = true;
      output += chunk.toString();
    });
    socket.on("error", reject);
    socket.on("close", () => {
      clearTimeout(timer);
      resolve({ output, elapsedMs: Date.now() - started, respondedBeforeExcess });
    });
  });
}

test("HTTP body limit and exact JSON media type", async (t) => {
  const config = httpConfigFromEnv({ MCP_HTTP_BEARER_TOKEN: TOKEN, MCP_HTTP_PORT: "0", MCP_HTTP_MAX_BODY_BYTES: String(MAX_BODY_BYTES) });
  const server = createHttpServer(config);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const port = server.address().port;

  for (const contentType of ["application/json", "application/json; charset=utf-8"]) {
    const response = await post(port, discover, { ...headers(contentType), "Content-Length": Buffer.byteLength(discover) });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.result.supportedVersions, ["2026-07-28"]);
  }
  const chunked = await post(port, discover, { ...headers(), "Transfer-Encoding": "chunked" });
  assert.equal(chunked.status, 200);
  assert.deepEqual(chunked.body.result.supportedVersions, ["2026-07-28"]);

  for (const contentType of ["application/jsonp", "text/json", "application/json garbage", ""]) {
    const invalid = await post(port, discover, { ...headers(contentType), "Content-Length": Buffer.byteLength(discover) });
    assert.equal(invalid.status, 415, contentType);
  }
  assert.equal((await post(port, discover, { ...headers(), Authorization: "Bearer wrong" })).status, 401);
  assert.equal((await post(port, discover, { ...headers(), Origin: "https://untrusted.example" })).status, 403);
  assert.equal((await post(port, discover, { ...headers(), "Mcp-Method": "tools/list" })).status, 400);

  const lengthTooLarge = await stalledOversize(port, { ...headers(), "Content-Length": MAX_BODY_BYTES + 1 });
  assert.match(lengthTooLarge.output, /^HTTP\/1\.1 413 /);
  assert.match(lengthTooLarge.output, /Connection: close/i);
  assert.ok(lengthTooLarge.elapsedMs < 2000, "Content-Length overflow must not wait for the body");

  const firstChunk = `64\r\n${"x".repeat(100)}\r\n`;
  const excessChunk = `1f4\r\n${"y".repeat(500)}\r\n`;
  const chunkedTooLarge = await stalledOversize(port, { ...headers(), "Transfer-Encoding": "chunked" }, firstChunk, excessChunk);
  assert.match(chunkedTooLarge.output, /^HTTP\/1\.1 413 /);
  assert.match(chunkedTooLarge.output, /Connection: close/i);

  const slowTooLarge = await stalledOversize(port, { ...headers(), "Transfer-Encoding": "chunked" }, firstChunk, excessChunk, 100);
  assert.equal(slowTooLarge.respondedBeforeExcess, false);
  assert.match(slowTooLarge.output, /^HTTP\/1\.1 413 /);
  assert.ok(slowTooLarge.elapsedMs < 2000, "slow chunked overflow must close before the final chunk");
  assert.equal(await new Promise((resolve, reject) => server.getConnections((error, count) => error ? reject(error) : resolve(count))), 0);

  assert.equal((await post(port, discover, { ...headers(), "Content-Length": Buffer.byteLength(discover) })).status, 200);
});
