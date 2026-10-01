const PROJECT_TOOLS = new Set([
  "start", "inspect", "review", "report", "detect", "status", "check", "test", "route", "doctor",
  "release_check", "evidence", "adapter", "handoff", "init", "pipeline", "journal", "session_status"
]);

export function authorizeTool(name) {
  if (["add", "project_info", "read_source", "search"].includes(name) || PROJECT_TOOLS.has(name)) {
    return { allowed: true, approvalRequired: false };
  }
  return {
    allowed: false,
    approvalRequired: false,
    code: "TOOL_NOT_ALLOWED",
    message: `tool is not registered: ${String(name)}`
  };
}

export function validateArguments(argumentsValue) {
  if (argumentsValue === null || typeof argumentsValue !== "object" || Array.isArray(argumentsValue)) {
    return { ok: false, code: "INVALID_INPUT", message: "arguments must be an object" };
  }
  const keys = Object.keys(argumentsValue).sort();
  if (!Object.prototype.hasOwnProperty.call(argumentsValue, "a") || !Object.prototype.hasOwnProperty.call(argumentsValue, "b")) {
    return { ok: false, code: "INVALID_INPUT", message: "arguments must include a and b" };
  }
  if (keys.some((key) => key !== "a" && key !== "b")) {
    return { ok: false, code: "INVALID_INPUT", message: "arguments may only contain a and b" };
  }
  if (!Number.isFinite(argumentsValue.a) || !Number.isFinite(argumentsValue.b)) {
    return { ok: false, code: "INVALID_INPUT", message: "a and b must be numbers" };
  }
  return { ok: true };
}

export function validateProjectArguments(argumentsValue) {
  if (argumentsValue === undefined) return { ok: true, project: "." };
  if (argumentsValue === null || typeof argumentsValue !== "object" || Array.isArray(argumentsValue)) {
    return { ok: false, code: "INVALID_INPUT", message: "arguments must be an object" };
  }
  const keys = Object.keys(argumentsValue);
  const allowed = new Set(["project", "confirm", "operation", "message", "deploy"]);
  if (keys.some((key) => !allowed.has(key))) {
    return { ok: false, code: "INVALID_INPUT", message: "unsupported project tool argument" };
  }
  if (argumentsValue.project !== undefined && (typeof argumentsValue.project !== "string" || argumentsValue.project.length === 0)) {
    return { ok: false, code: "INVALID_INPUT", message: "project must be a non-empty relative path" };
  }
  if (argumentsValue.confirm !== undefined && typeof argumentsValue.confirm !== "boolean") {
    return { ok: false, code: "INVALID_INPUT", message: "confirm must be boolean" };
  }
  if (argumentsValue.operation !== undefined && typeof argumentsValue.operation !== "string") {
    return { ok: false, code: "INVALID_INPUT", message: "operation must be a string" };
  }
  if (argumentsValue.message !== undefined && typeof argumentsValue.message !== "string") {
    return { ok: false, code: "INVALID_INPUT", message: "message must be a string" };
  }
  if (argumentsValue.deploy !== undefined && typeof argumentsValue.deploy !== "boolean") {
    return { ok: false, code: "INVALID_INPUT", message: "deploy must be boolean" };
  }
  return { ok: true, ...argumentsValue, project: argumentsValue.project || "." };
}
