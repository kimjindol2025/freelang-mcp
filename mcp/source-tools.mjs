import fs from "node:fs";
import path from "node:path";
import { PROTOCOL_VERSION, listTools } from "./registry.mjs";

const MAX_SOURCE_BYTES = 100_000;
const MAX_MATCHES = 50;
const MAX_FILES = 256;
const SKIP_DIRECTORIES = new Set([".git", "node_modules", ".freelang"]);

function invalid(message) {
  return { ok: false, error: { code: "INVALID_INPUT", message } };
}

export function resolveSourcePath(cwd, relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0 || relativePath.includes("\0")) {
    return invalid("path must be a non-empty relative path");
  }
  if (path.isAbsolute(relativePath) || relativePath.includes("\\") || relativePath.split("/").includes("..")) {
    return { ok: false, error: { code: "SOURCE_SCOPE_DENIED", message: "path must stay inside the MCP workspace" } };
  }
  const workspace = path.resolve(cwd);
  const resolved = path.resolve(workspace, relativePath);
  const relative = path.relative(workspace, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return { ok: false, error: { code: "SOURCE_SCOPE_DENIED", message: "path must stay inside the MCP workspace" } };
  }
  let stat;
  let canonical;
  try {
    canonical = fs.realpathSync(resolved);
    stat = fs.statSync(canonical);
  } catch { return { ok: false, error: { code: "SOURCE_NOT_FOUND", message: `source file not found: ${relativePath}` } }; }
  const canonicalWorkspace = fs.realpathSync(workspace);
  const canonicalRelative = path.relative(canonicalWorkspace, canonical);
  if (canonicalRelative === ".." || canonicalRelative.startsWith(`..${path.sep}`) || path.isAbsolute(canonicalRelative)) {
    return { ok: false, error: { code: "SOURCE_SCOPE_DENIED", message: "path must stay inside the MCP workspace" } };
  }
  if (!stat.isFile()) return { ok: false, error: { code: "SOURCE_NOT_FOUND", message: `source file not found: ${relativePath}` } };
  if (stat.size > MAX_SOURCE_BYTES) return { ok: false, error: { code: "SOURCE_TOO_LARGE", message: `source file exceeds ${MAX_SOURCE_BYTES} bytes` } };
  return { ok: true, path: canonical, relative: relative || path.basename(resolved) };
}

export function readSource(cwd, options = {}) {
  const target = resolveSourcePath(cwd, options.path);
  if (!target.ok) return target;
  const startLine = options.startLine === undefined ? 1 : options.startLine;
  const endLine = options.endLine === undefined ? null : options.endLine;
  if (!Number.isInteger(startLine) || startLine < 1 || (endLine !== null && (!Number.isInteger(endLine) || endLine < startLine))) {
    return invalid("startLine and endLine must be positive integers with endLine >= startLine");
  }
  const content = fs.readFileSync(target.path, "utf8");
  const lines = content.split("\n");
  const lastLine = endLine ?? lines.length;
  if (lastLine > lines.length) return invalid("requested source line is out of range");
  return { ok: true, value: { path: target.relative, startLine, endLine: lastLine, content: lines.slice(startLine - 1, lastLine).join("\n") } };
}

function collectFiles(directory, output) {
  if (output.length >= MAX_FILES) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (output.length >= MAX_FILES) return;
    if (entry.isDirectory() && !SKIP_DIRECTORIES.has(entry.name) && !entry.name.startsWith(".")) {
      collectFiles(path.join(directory, entry.name), output);
    } else if (entry.isFile() && !entry.name.startsWith(".")) {
      output.push(path.join(directory, entry.name));
    }
  }
}

export function searchSource(cwd, options = {}) {
  if (typeof options.query !== "string" || options.query.length === 0) return invalid("query must be a non-empty string");
  let files = [];
  if (options.path !== undefined) {
    const target = resolveSourcePath(cwd, options.path);
    if (!target.ok) return target;
    files = [target.path];
  } else {
    collectFiles(path.resolve(cwd), files);
  }
  const matches = [];
  const workspace = path.resolve(cwd);
  for (const file of files) {
    let content;
    try {
      if (fs.statSync(file).size > MAX_SOURCE_BYTES) continue;
      content = fs.readFileSync(file, "utf8");
    } catch { continue; }
    const lines = content.split("\n");
    lines.forEach((line, index) => {
      if (matches.length < MAX_MATCHES && line.includes(options.query)) {
        matches.push({ path: path.relative(workspace, file), line: index + 1, text: line });
      }
    });
  }
  return { ok: true, value: { query: options.query, path: options.path ?? "*", matches, truncated: matches.length >= MAX_MATCHES } };
}

export function projectInfo(cwd, context = {}) {
  return {
    project: path.basename(path.resolve(cwd)),
    protocolVersion: context.protocolVersion || PROTOCOL_VERSION,
    transport: context.transport || "stdio",
    workspace: path.resolve(cwd),
    tools: listTools().map((tool) => tool.name)
  };
}
