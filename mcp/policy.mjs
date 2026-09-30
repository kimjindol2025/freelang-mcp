export function authorizeTool(name) {
  if (["add", "status", "check", "test"].includes(name)) {
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
  if (keys.some((key) => key !== "project")) {
    return { ok: false, code: "INVALID_INPUT", message: "arguments may only contain project" };
  }
  if (argumentsValue.project !== undefined && (typeof argumentsValue.project !== "string" || argumentsValue.project.length === 0)) {
    return { ok: false, code: "INVALID_INPUT", message: "project must be a non-empty relative path" };
  }
  return { ok: true, project: argumentsValue.project || "." };
}
