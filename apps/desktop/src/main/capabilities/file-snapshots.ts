import { dialog, type BrowserWindow } from "electron";
import { createHash } from "node:crypto";
import { basename, extname } from "node:path";
import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";

export type FileSnapshot = {
  originalPath: string;
  basename: string;
  size: number;
  mime: string;
  hash: string;
  binary: boolean;
  contentPreview: string | null;
};

const maxFileSizeBytes = 5 * 1024 * 1024;
const PREVIEW_LIMIT = 64 * 1024;

function guessMime(filePath: string) {
  const ext = extname(filePath).toLowerCase();
  if ([".md", ".markdown"].includes(ext)) return "text/markdown";
  if ([".txt", ".log"].includes(ext)) return "text/plain";
  if ([".json"].includes(ext)) return "application/json";
  if ([".yaml", ".yml"].includes(ext)) return "application/yaml";
  if ([".ts", ".tsx", ".js", ".jsx", ".css", ".html"].includes(ext)) return "text/plain";
  return "application/octet-stream";
}

function looksBinary(buffer: Buffer) {
  return buffer.subarray(0, Math.min(buffer.length, 4096)).includes(0);
}

async function hashFile(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function readPreviewBytes(filePath: string, limit: number) {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(limit);
    const { bytesRead } = await handle.read(buffer, 0, limit, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export async function selectFileSnapshot(
  parentWindow: BrowserWindow,
): Promise<{ ok: true; snapshot: FileSnapshot | null } | { ok: false; error: string }> {
  const result = await dialog.showOpenDialog(parentWindow, {
    title: "Select file snapshot",
    properties: ["openFile"],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { ok: true, snapshot: null };
  }

  const originalPath = result.filePaths[0];
  const fileStat = await stat(originalPath);
  if (!fileStat.isFile()) {
    return { ok: false, error: "Selected path is not a file" };
  }

  const firstBytes = await readPreviewBytes(originalPath, PREVIEW_LIMIT);
  const binary = looksBinary(firstBytes);
  const hash = await hashFile(originalPath);
  const size = fileStat.size;
  const mime = guessMime(originalPath);

  if (binary || size > maxFileSizeBytes) {
    return {
      ok: true,
      snapshot: {
        originalPath,
        basename: basename(originalPath),
        size,
        mime,
        hash,
        binary,
        contentPreview: null,
      },
    };
  }

  return {
    ok: true,
    snapshot: {
      originalPath,
      basename: basename(originalPath),
      size,
      mime,
      hash,
      binary: false,
      contentPreview: firstBytes.toString("utf8", 0, Math.min(firstBytes.length, PREVIEW_LIMIT)),
    },
  };
}
