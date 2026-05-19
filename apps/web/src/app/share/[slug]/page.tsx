import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { chatSessions, messages, agents } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { Bot, User } from "lucide-react";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function SharePage({ params }: Props) {
  const { slug } = await params;
  const [session] = await db
    .select()
    .from(chatSessions)
    .where(and(eq(chatSessions.publicSlug, slug), eq(chatSessions.isPublic, true)))
    .limit(1);

  if (!session) notFound();

  const msgs = await db.select().from(messages).where(eq(messages.sessionId, session.id)).orderBy(messages.createdAt);

  let agentName: string | null = null;
  if (session.agentId) {
    const [agent] = await db.select({ name: agents.name }).from(agents).where(eq(agents.id, session.agentId)).limit(1);
    agentName = agent?.name ?? null;
  }

  return (
    <div className="agenthub-page min-h-screen">
      <header className="agenthub-window mx-auto flex max-w-5xl items-center gap-3 px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">{session.title}</h1>
          {agentName && <p className="text-sm text-muted-foreground">with {agentName}</p>}
        </div>
        <div className="ml-auto">
          <Link href="/" className="agenthub-primary-button rounded-xl px-3 py-2 text-sm font-medium">
            Fork this conversation
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-2 px-4 py-8">
        {msgs
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => (
            <div
              key={m.id}
              className={`flex gap-3 rounded-2xl px-4 py-5 ${m.role === "user" ? "bg-white/10" : "agenthub-glass-panel"}`}
            >
              <div className="mt-1 flex-shrink-0">
                {m.role === "user" ? (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary">
                    <User className="w-4 h-4 text-primary-foreground" />
                  </div>
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10">
                    <Bot className="w-4 h-4" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 text-sm font-medium">{m.role === "user" ? "You" : (agentName ?? "Assistant")}</div>
                <div className="whitespace-pre-wrap text-sm">{m.content}</div>
              </div>
            </div>
          ))}
      </main>
    </div>
  );
}
