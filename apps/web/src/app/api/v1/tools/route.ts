import { NextRequest, NextResponse } from "next/server";
import { globalToolRegistry } from "@agenthub/agent-runtime";
import { asc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { installedSkills } from "@/server/db/schema";
import { limitFromRequest, requireApiUser } from "@/server/public-api";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireApiUser(req);
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const limit = limitFromRequest(req);

  const skills = await db
    .select({
      id: installedSkills.id,
      slug: installedSkills.slug,
      name: installedSkills.name,
      description: installedSkills.description,
      source: installedSkills.source,
      updatedAt: installedSkills.updatedAt,
    })
    .from(installedSkills)
    .where(eq(installedSkills.userId, userId))
    .orderBy(asc(installedSkills.name))
    .limit(limit);

  const builtIns = globalToolRegistry.list().map((tool) => ({
    name: tool.name,
    description: tool.description,
    source: "built-in",
  }));

  return NextResponse.json({ data: { builtIns, skills } });
}
