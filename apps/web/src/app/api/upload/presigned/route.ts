import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { getUploadUrl, bucket } from "@/lib/s3";
import { db } from "@/server/db";
import { files } from "@/server/db/schema";
import { checkQuota, incrementQuota } from "@/server/quotas";
import { randomUUID } from "node:crypto";

const IMAGE_UPLOAD_LIMIT_BYTES = 10 * 1024 * 1024;
const DOCUMENT_UPLOAD_LIMIT_BYTES = 50 * 1024 * 1024;
const VIDEO_UPLOAD_LIMIT_BYTES = 500 * 1024 * 1024;
const MAX_UPLOAD_BYTES = VIDEO_UPLOAD_LIMIT_BYTES;
const ALLOWED_MIME_PREFIXES = ["image/", "text/", "video/"];
const ALLOWED_MIME_TYPES = new Set([
  "application/json",
  "application/pdf",
  "application/csv",
  "text/csv",
  "text/markdown",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const FORBIDDEN_EXTENSIONS = new Set([".bat", ".cmd", ".com", ".dll", ".exe", ".msi", ".ps1", ".sh", ".so"]);

function safeFilename(value: unknown) {
  if (typeof value !== "string") return null;
  const basename = value.split(/[\\/]/).pop()?.trim() ?? "";
  const cleaned = basename
    .replace(/[^A-Za-z0-9._ -]/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 160);
  return cleaned || null;
}

function fileExtension(filename: string) {
  const match = filename.toLowerCase().match(/\.[a-z0-9]+$/);
  return match?.[0] ?? "";
}

function uploadLimitForContentType(contentType: string) {
  if (contentType.startsWith("image/")) {
    return { category: "image", bytes: IMAGE_UPLOAD_LIMIT_BYTES, label: "10 MB" };
  }
  if (contentType.startsWith("video/")) {
    return { category: "video", bytes: VIDEO_UPLOAD_LIMIT_BYTES, label: "500 MB" };
  }
  return { category: "document", bytes: DOCUMENT_UPLOAD_LIMIT_BYTES, label: "50 MB" };
}

function isAllowedMimeType(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return ALLOWED_MIME_PREFIXES.some((prefix) => value.startsWith(prefix)) || ALLOWED_MIME_TYPES.has(value);
}

export async function POST(req: NextRequest) {
  const session = await auth(req.headers);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { filename, contentType, size } = await req.json();
  const safeName = safeFilename(filename);
  if (!safeName || !isAllowedMimeType(contentType)) {
    return NextResponse.json({ error: "Missing filename or contentType" }, { status: 400 });
  }
  if (FORBIDDEN_EXTENSIONS.has(fileExtension(safeName))) {
    return NextResponse.json({ error: "This file type is not allowed" }, { status: 400 });
  }
  const uploadSize = Number(size || 0);
  const limit = uploadLimitForContentType(contentType);
  if (!Number.isFinite(uploadSize) || uploadSize < 0 || uploadSize > MAX_UPLOAD_BYTES || uploadSize > limit.bytes) {
    return NextResponse.json({ error: `${limit.category} uploads are limited to ${limit.label}` }, { status: 400 });
  }
  const storageQuota = await checkQuota(session.user.id, "storage", uploadSize);
  if (!storageQuota.allowed) {
    return NextResponse.json(
      {
        error: storageQuota.reason,
        quota: {
          action: storageQuota.action,
          current: storageQuota.current,
          limit: storageQuota.limit,
          requested: storageQuota.requested,
          resetAt: storageQuota.resetAt.toISOString(),
        },
      },
      { status: 429 },
    );
  }

  const key = `uploads/${session.user.id}/${Date.now()}-${randomUUID()}-${safeName}`;
  const uploadUrl = await getUploadUrl(key, contentType);

  const [file] = await db
    .insert(files)
    .values({
      userId: session.user.id as string,
      name: safeName,
      mimeType: contentType,
      size: uploadSize,
      s3Key: key,
      s3Url: `${process.env.S3_ENDPOINT}/${bucket}/${key}`,
      metadata: {
        uploadStatus: "pending",
        declaredMimeType: contentType,
        declaredSize: uploadSize,
      },
    })
    .returning();

  await incrementQuota(session.user.id, { storageUsed: uploadSize, apiCalls: 1 });

  return NextResponse.json({
    uploadUrl,
    fileId: file.id,
    s3Url: file.s3Url,
    key,
  });
}
