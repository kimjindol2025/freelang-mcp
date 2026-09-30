export function authorizeTool(name) {
  if (name === "add") {
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
  return { ok: true };
}
