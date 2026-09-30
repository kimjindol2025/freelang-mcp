import assert from "node:assert/strict";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const url = new URL(process.env.MCP_HTTP_URL || "http://127.0.0.1:41951/mcp");
const token = process.env.MCP_HTTP_BEARER_TOKEN;
if (!token) throw new Error("MCP_HTTP_BEARER_TOKEN is required for the HTTP client test");

const client = new Client(
  { name: "freelang-mcp-http-test-client", version: "0.1.0" },
  { versionNegotiation: { mode: { pin: "2026-07-28" } } }
);
const transport = new StreamableHTTPClientTransport(url, {
  requestInit: { headers: { Authorization: `Bearer ${token}` } }
});

try {
  await client.connect(transport);
  assert.equal(client.getProtocolEra(), "modern");
  assert.equal(client.getNegotiatedProtocolVersion(), "2026-07-28");
  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map((tool) => tool.name), ["add"]);
  const result = await client.callTool({ name: "add", arguments: { a: 2, b: 3 } });
  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.result, 5);
  console.log("MCP_HTTP_SDK=PASS");
  console.log("MCP_HTTP_PROTOCOL=2026-07-28");
  console.log("MCP_HTTP_TOOL_RESULT=5");
} finally {
  await client.close().catch(() => {});
  await transport.close().catch(() => {});
}
