import assert from "node:assert/strict";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { runAdd } from "../runner.mjs";

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
  const listedNames = listed.tools.map((tool) => tool.name);
  assert.equal(listedNames.length, 20);
  for (const name of ["add", "start", "inspect", "review", "status", "check", "test", "doctor", "release_check", "evidence", "adapter", "handoff", "init", "pipeline", "journal", "safe_push", "session_status"]) {
    assert.equal(listedNames.includes(name), true, name);
  }
  assert.match(listed.tools[0].description, /FreeLang Script/);
  assert.equal(listed.tools[0].inputSchema.type, "object");
  assert.deepEqual(listed.tools[0].inputSchema.required, ["a", "b"]);
  assert.equal(listed.tools[0].inputSchema.additionalProperties, false);
  assert.equal(listed.tools[0].inputSchema.properties.a.type, "number");
  assert.equal(listed.tools[0].inputSchema.properties.b.type, "number");
  const result = await client.callTool({ name: "add", arguments: { a: 2, b: 3 } });
  const direct = runAdd(2, 3);
  assert.equal(direct.ok, true, JSON.stringify(direct));
  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.result, direct.result);
  assert.equal(result.content[0].text, String(direct.result));
  for (const argumentsValue of [{ a: "2", b: 3 }, { a: 2 }, { a: 2, b: 3, extra: 1 }]) {
    const invalid = await client.callTool({ name: "add", arguments: argumentsValue });
    assert.equal(invalid.isError, true);
    assert.equal(invalid.structuredContent.error.code, "INVALID_INPUT");
  }
  const overflow = await client.callTool({ name: "add", arguments: { a: 1e308, b: 1e308 } });
  const directOverflow = runAdd(1e308, 1e308);
  assert.equal(directOverflow.ok, false);
  assert.equal(overflow.isError, true);
  assert.equal(overflow.structuredContent.error.code, directOverflow.error.code);
  console.log("MCP_HTTP_SDK=PASS");
  console.log("MCP_HTTP_PROTOCOL=2026-07-28");
  console.log("MCP_HTTP_TOOL_RESULT=5");
  console.log("MCP_HTTP_TOOL_COVERAGE=PASS");
  console.log("MCP_HTTP_FREELANG_MATCH=PASS");
} finally {
  await client.close().catch(() => {});
  await transport.close().catch(() => {});
}
