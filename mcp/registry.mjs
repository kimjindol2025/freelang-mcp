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

const PROJECT_INFO_TOOL = Object.freeze({
  name: "project_info",
  title: "FreeLang Project Info",
  description: "Return metadata for the current MCP workspace.",
  inputSchema: Object.freeze({ type: "object", properties: Object.freeze({}), additionalProperties: false }),
  annotations: Object.freeze({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false })
});

const READ_SOURCE_TOOL = Object.freeze({
  name: "read_source",
  title: "Read Project Source",
  description: "Read a bounded source file inside the MCP workspace.",
  inputSchema: Object.freeze({
    type: "object",
    properties: Object.freeze({ path: Object.freeze({ type: "string" }), startLine: Object.freeze({ type: "integer", minimum: 1 }), endLine: Object.freeze({ type: "integer", minimum: 1 }) }),
    required: Object.freeze(["path"]),
    additionalProperties: false
  }),
  annotations: Object.freeze({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false })
});

const SEARCH_TOOL = Object.freeze({
  name: "search",
  title: "Search Project Source",
  description: "Search project source files for a literal string, with bounded results.",
  inputSchema: Object.freeze({
    type: "object",
    properties: Object.freeze({ query: Object.freeze({ type: "string" }), path: Object.freeze({ type: "string" }) }),
    required: Object.freeze(["query"]),
    additionalProperties: false
  }),
  annotations: Object.freeze({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false })
});

const PROJECT_TOOL_INPUT = Object.freeze({
  type: "object",
  properties: Object.freeze({
    project: Object.freeze({ type: "string", description: "Project path relative to the MCP workspace; defaults to ." }),
    confirm: Object.freeze({ type: "boolean", description: "Required for state-changing tools." }),
    operation: Object.freeze({ type: "string", enum: Object.freeze(["show", "init", "add"]) }),
    message: Object.freeze({ type: "string" }),
    deploy: Object.freeze({ type: "boolean", description: "Deployment is not exposed through MCP." })
  }),
  additionalProperties: false
});

function projectTool(name, title, description) {
  const mutating = projectToolDefinition(name).mutating === true;
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
      readOnlyHint: false,
      destructiveHint: mutating,
      idempotentHint: false,
      openWorldHint: false
    })
  });
}

const PROJECT_TOOLS = PROJECT_TOOL_NAMES.map((name) => projectTool(name, `FreeLang ${name}`, `Run the registered ${name} FreeLang Tools operation.`));

export function listTools() {
  return [ADD_TOOL, PROJECT_INFO_TOOL, READ_SOURCE_TOOL, SEARCH_TOOL, ...PROJECT_TOOLS];
}

export function getTool(name) {
  return listTools().find((tool) => tool.name === name) || null;
}
import { PROJECT_TOOL_NAMES, projectToolDefinition } from "./project-tools.mjs";
