import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ToolDefinition } from "../registry";

const DEFAULT_MAX_BYTES = 64 * 1024;
const DENIED_SEGMENTS = new Set([".env", ".git", "node_modules", ".next", ".turbo"]);
const DENIED_EXTENSIONS = new Set([".db", ".sqlite", ".sqlite3", ".pem", ".key", ".p12", ".pfx"]);

function resolveAllowedRoot() {
  return path.resolve(process.env.AGENTHUB_READ_FILE_ROOT || process.cwd());
}

function resolveSafePath(requestedPath: string) {
  const root = resolveAllowedRoot();
  if (!requestedPath || requestedPath.includes("\0")) {
    throw new Error("Invalid file path");
  }

  const absolutePath = path.resolve(root, requestedPath);
  const relativePath = path.relative(root, absolutePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Path is outside the allowed read_file root");
  }

  const segments = relativePath.split(path.sep).filter(Boolean);
  if (segments.some((segment) => DENIED_SEGMENTS.has(segment) || segment.startsWith("."))) {
    throw new Error("Path is denied by read_file sandbox policy");
  }

  if (DENIED_EXTENSIONS.has(path.extname(absolutePath).toLowerCase())) {
    throw new Error("File extension is denied by read_file sandbox policy");
  }

  return { root, absolutePath, relativePath };
}

export const readFileTool: ToolDefinition = {
  name: "read_file",
  description: "Safely read a UTF-8 text file under the configured AgentHub read root.",
  parameters: z.object({
    path: z.string().describe("Relative path to read within the allowed root."),
  }),
  execute: async ({ path: requestedPath }) => {
    const { root, absolutePath, relativePath } = resolveSafePath(requestedPath);
    const fileStat = await stat(absolutePath);

    if (!fileStat.isFile()) {
      throw new Error("read_file can only read regular files");
    }
    if (fileStat.size > DEFAULT_MAX_BYTES) {
      throw new Error(`File exceeds read_file size limit of ${DEFAULT_MAX_BYTES} bytes`);
    }

    const content = await readFile(absolutePath, "utf8");
    return {
      root,
      path: relativePath,
      bytes: Buffer.byteLength(content, "utf8"),
      content,
    };
  },
};
