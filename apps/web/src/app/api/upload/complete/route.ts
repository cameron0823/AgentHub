import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { files } from "@/server/db/schema";
import { getObjectPrefix, headObject } from "@/lib/s3";
import { validateUploadBytes } from "@/server/security/upload-validation";

function metadataObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function POST(req: NextRequest) {
  const session = await auth(req.headers);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { fileId, key, size, contentType } = await req.json();
  if (typeof fileId !== "string") {
    return NextResponse.json({ error: "Missing fileId" }, { status: 400 });
  }

  const [file] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.userId, session.user.id)))
    .limit(1);
  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  if (typeof key === "string" && key !== file.s3Key) {
    return NextResponse.json({ error: "Upload key does not match file record" }, { status: 400 });
  }
  if (typeof contentType === "string" && contentType !== file.mimeType) {
    return NextResponse.json({ error: "Declared content type changed after presign" }, { status: 400 });
  }
  if (typeof size === "number" && Number.isFinite(size) && size !== file.size) {
    return NextResponse.json({ error: "Declared file size changed after presign" }, { status: 400 });
  }

  const head = await headObject(file.s3Key);
  if (typeof head.ContentLength === "number" && head.ContentLength !== file.size) {
    return NextResponse.json({ error: "Uploaded object size does not match presigned size" }, { status: 400 });
  }

  const prefix = await getObjectPrefix(file.s3Key);
  const validation = validateUploadBytes(prefix, file.mimeType);
  if (!validation.ok) {
    await db
      .update(files)
      .set({
        metadata: {
          ...metadataObject(file.metadata),
          uploadStatus: "rejected",
          rejectedAt: new Date().toISOString(),
          rejectionReason: validation.reason,
          detectedMimeType: validation.detectedMimeType,
        },
      })
      .where(eq(files.id, file.id));
    return NextResponse.json({ error: validation.reason ?? "Upload validation failed" }, { status: 400 });
  }

  const [updated] = await db
    .update(files)
    .set({
      metadata: {
        ...metadataObject(file.metadata),
        uploadStatus: "validated",
        validatedAt: new Date().toISOString(),
        detectedMimeType: validation.detectedMimeType,
        headContentType: head.ContentType,
        contentLength: head.ContentLength,
      },
    })
    .where(eq(files.id, file.id))
    .returning();

  return NextResponse.json({
    fileId: updated.id,
    key: updated.s3Key,
    s3Url: updated.s3Url,
    detectedMimeType: validation.detectedMimeType,
    uploadStatus: "validated",
  });
}
