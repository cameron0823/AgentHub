import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { getUploadUrl, bucket } from "@/lib/s3";
import { db } from "@/server/db";
import { files } from "@/server/db/schema";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { filename, contentType, size } = await req.json();
  if (!filename || !contentType) {
    return NextResponse.json({ error: "Missing filename or contentType" }, { status: 400 });
  }

  const key = `uploads/${session.user.id}/${Date.now()}-${filename}`;
  const uploadUrl = await getUploadUrl(key, contentType);

  const [file] = await db.insert(files).values({
    userId: session.user.id as string,
    name: filename,
    mimeType: contentType,
    size: size || 0,
    s3Key: key,
    s3Url: `${process.env.S3_ENDPOINT}/${bucket}/${key}`,
  }).returning();

  return NextResponse.json({
    uploadUrl,
    fileId: file.id,
    s3Url: file.s3Url,
    key,
  });
}
