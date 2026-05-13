import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { knowledgeBases } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { hybridKbSearch } from "@/server/kb-search";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { query, knowledgeBaseId, limit = 5 } = await req.json();
  if (!query) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  // Verify KB ownership before searching
  const [kb] = await db
    .select()
    .from(knowledgeBases)
    .where(and(eq(knowledgeBases.id, knowledgeBaseId), eq(knowledgeBases.userId, session.user.id)))
    .limit(1);

  if (!kb) {
    return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
  }

  try {
    const results = await hybridKbSearch({ query, knowledgeBaseId, limit });
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      { status: 500 }
    );
  }
}
