export const PROTOCOL_VERSION = "2025-11-25";
export const MODERN_PROTOCOL_VERSION = "2026-07-28";

export const SERVER_INFO = Object.freeze({
  name: "freelang-mcp",
  title: "FreeLang MCP",
  version: "0.1.0",
  description: "MCP server backed by FreeLang Script"
});

const ADD_TOOL = Object.freeze({
  name: "add",
  title: "FreeLang Add",
  description: "Add two numbers by executing FreeLang Script.",
  inputSchema: Object.freeze({
    type: "object",
    properties: Object.freeze({
      a: Object.freeze({ type: "number", description: "First number" }),
      b: Object.freeze({ type: "number", description: "Second number" })
    }),
    required: Object.freeze(["a", "b"]),
    additionalProperties: false
  }),
  outputSchema: Object.freeze({
    type: "object",
    properties: Object.freeze({ result: Object.freeze({ type: "number" }) }),
    required: Object.freeze(["result"]),
    additionalProperties: false
  }),
  annotations: Object.freeze({
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  })
});

export function listTools() {
  return [ADD_TOOL];
}

export function getTool(name) {
  return name === ADD_TOOL.name ? ADD_TOOL : null;
}
