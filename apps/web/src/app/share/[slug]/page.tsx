import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { chatSessions, messages, agents } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { Bot, User } from "lucide-react";

export const dynamic = "force-dynamic";

interface Props {
  params: { slug: string };
}

export default async function SharePage({ params }: Props) {
  const [session] = await db
    .select()
    .from(chatSessions)
    .where(and(eq(chatSessions.publicSlug, params.slug), eq(chatSessions.isPublic, true)))
    .limit(1);

  if (!session) notFound();

  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, session.id))
    .orderBy(messages.createdAt);

  let agentName: string | null = null;
  if (session.agentId) {
    const [agent] = await db.select({ name: agents.name }).from(agents).where(eq(agents.id, session.agentId)).limit(1);
    agentName = agent?.name ?? null;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4 flex items-center gap-3">
        <div>
          <h1 className="font-semibold text-lg">{session.title}</h1>
          {agentName && <p className="text-sm text-muted-foreground">with {agentName}</p>}
        </div>
        <div className="ml-auto">
          <a
            href="/"
            className="text-sm px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Fork this conversation
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto py-8 px-4 space-y-1">
        {msgs
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => (
            <div key={m.id} className={`flex gap-3 px-4 py-5 ${m.role === "user" ? "bg-muted/30 rounded-lg" : ""}`}>
              <div className="flex-shrink-0 mt-1">
                {m.role === "user" ? (
                  <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center">
                    <User className="w-4 h-4 text-primary-foreground" />
                  </div>
                ) : (
                  <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center">
                    <Bot className="w-4 h-4" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm mb-1">{m.role === "user" ? "You" : agentName ?? "Assistant"}</div>
                <div className="text-sm whitespace-pre-wrap">{m.content}</div>
              </div>
            </div>
          ))}
      </main>
    </div>
  );
}
