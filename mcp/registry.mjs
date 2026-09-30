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

const PROJECT_TOOL_INPUT = Object.freeze({
  type: "object",
  properties: Object.freeze({
    project: Object.freeze({ type: "string", description: "Project path relative to the MCP workspace; defaults to ." })
  }),
  additionalProperties: false
});

function projectTool(name, title, description) {
  return Object.freeze({
    name,
    title,
    description,
    inputSchema: PROJECT_TOOL_INPUT,
    outputSchema: Object.freeze({
      type: "object",
      properties: Object.freeze({
        project: Object.freeze({ type: "string" }),
        status: Object.freeze({ type: "string" }),
        output: Object.freeze({ type: "string" }),
        exitCode: Object.freeze({ type: "number" })
      }),
      required: Object.freeze(["project", "status", "output"]),
      additionalProperties: true
    }),
    annotations: Object.freeze({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    })
  });
}

const STATUS_TOOL = projectTool("status", "FreeLang Status", "Inspect project dialect, runner, Git state, and test status.");
const CHECK_TOOL = projectTool("check", "FreeLang Check", "Run the registered FreeLang syntax and contract checks for a project.");
const TEST_TOOL = projectTool("test", "FreeLang Test", "Run the registered FreeLang test suite for a project.");

export function listTools() {
  return [ADD_TOOL, STATUS_TOOL, CHECK_TOOL, TEST_TOOL];
}

export function getTool(name) {
  return listTools().find((tool) => tool.name === name) || null;
}
