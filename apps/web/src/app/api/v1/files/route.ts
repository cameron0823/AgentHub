import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { files } from "@/server/db/schema";
import { limitFromRequest, requireApiUser } from "@/server/public-api";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireApiUser(req);
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const limit = limitFromRequest(req);

  const items = await db
    .select()
    .from(files)
    .where(eq(files.userId, userId))
    .orderBy(desc(files.createdAt))
    .limit(limit);

  return NextResponse.json({
    data: items,
    upload: { presignEndpoint: "/api/upload/presigned" },
  });
}
