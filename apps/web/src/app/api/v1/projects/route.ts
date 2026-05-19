import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { projects } from "@/server/db/schema";
import { limitFromRequest, parseJsonBody, requireApiUser } from "@/server/public-api";

export const runtime = "nodejs";

const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireApiUser(req);
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const limit = limitFromRequest(req);

  const items = await db
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.updatedAt))
    .limit(limit);

  return NextResponse.json({ data: items });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUser(req);
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  const parsed = await parseJsonBody(req, createProjectSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  const [project] = await db
    .insert(projects)
    .values({
      userId,
      name: input.name,
      description: input.description ?? null,
      metadata: input.metadata ?? {},
    })
    .returning();

  return NextResponse.json({ data: project }, { status: 201 });
}
