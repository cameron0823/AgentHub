import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { router, authedProcedure } from "../trpc";
import { db } from "../db";
import { agents, chatSessions, messages, pageAgentEdits, pageComments, pageVersions, pages } from "../db/schema";

type PageAuthorType = "human" | "agent" | "system";
type PageCopilotAction = "append" | "prepend" | "replace-selection";
type PageVersionSource = "human" | "agent" | "system" | "import" | "restore";

const lexicalStateSchema = z.record(z.unknown()).optional();
const VERSION_RETENTION_DAYS = 90;

function derivePlainText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[#>*_`~\-[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function createPageLexicalState(markdown: string) {
  const blocks = markdown.trim() ? markdown.split(/\n{2,}/) : [""];
  return {
    root: {
      children: blocks.map((block) => ({
        children: [{ detail: 0, format: 0, mode: "normal", style: "", text: block, type: "text", version: 1 }],
        direction: null,
        format: "",
        indent: 0,
        type: "paragraph",
        version: 1,
      })),
      direction: null,
      format: "",
      indent: 0,
      type: "root",
      version: 1,
    },
  };
}

function pageTitleFromMarkdown(markdown: string, fallback = "Untitled Page") {
  const firstLine = markdown.split(/\r?\n/).find((line) => line.trim());
  return (
    firstLine
      ?.replace(/^#+\s*/, "")
      .trim()
      .slice(0, 100) || fallback
  );
}

function selectedRange(markdown: string, start?: number, end?: number) {
  if (typeof start !== "number" || typeof end !== "number") return undefined;
  const safeStart = Math.max(0, Math.min(start, markdown.length));
  const safeEnd = Math.max(safeStart, Math.min(end, markdown.length));
  return { start: safeStart, end: safeEnd, text: markdown.slice(safeStart, safeEnd) };
}

export function applyPageCopilotMarkdownEdit(
  markdown: string,
  input: {
    instruction: string;
    action: PageCopilotAction;
    selectionStart?: number;
    selectionEnd?: number;
  },
) {
  const range = selectedRange(markdown, input.selectionStart, input.selectionEnd);
  const selectedText = range?.text.trim();
  const copilotBlock = [
    "",
    `> Page Agent Copilot: ${input.instruction.trim()}`,
    "",
    selectedText ? selectedText : "Draft the next section here.",
    "",
  ].join("\n");

  if (input.action === "prepend") return `${copilotBlock}\n${markdown}`.trim();
  if (input.action === "replace-selection" && range) {
    return `${markdown.slice(0, range.start)}${copilotBlock.trim()}${markdown.slice(range.end)}`.trim();
  }
  return `${markdown}\n${copilotBlock}`.trim();
}

export function buildMarkdownDiffSummary(beforeMarkdown: string, afterMarkdown: string) {
  const beforeLines = beforeMarkdown.split(/\r?\n/).filter((line) => line.trim());
  const afterLines = afterMarkdown.split(/\r?\n/).filter((line) => line.trim());
  const beforeSet = new Set(beforeLines);
  const afterSet = new Set(afterLines);
  return {
    addedLines: afterLines.filter((line) => !beforeSet.has(line)).length,
    removedLines: beforeLines.filter((line) => !afterSet.has(line)).length,
    beforeChars: beforeMarkdown.length,
    afterChars: afterMarkdown.length,
  };
}

function retentionExpiresAt() {
  return new Date(Date.now() + VERSION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

async function createPageVersion(input: {
  page: typeof pages.$inferSelect;
  sourceType: PageVersionSource;
  beforeMarkdown?: string;
  agentId?: string | null;
  sourceMessageId?: string | null;
}) {
  const [version] = await db
    .insert(pageVersions)
    .values({
      pageId: input.page.id,
      userId: input.page.userId,
      agentId: input.agentId ?? input.page.agentId ?? null,
      sourceMessageId: input.sourceMessageId ?? input.page.sourceMessageId ?? null,
      versionNumber: input.page.currentVersion,
      title: input.page.title,
      markdown: input.page.markdown,
      lexicalState: input.page.lexicalState,
      plainText: input.page.plainText,
      sourceType: input.sourceType,
      diffSummary: buildMarkdownDiffSummary(input.beforeMarkdown ?? "", input.page.markdown),
      retentionExpiresAt: retentionExpiresAt(),
    })
    .returning();
  return version;
}

async function assertPageOwned(userId: string, pageId: string) {
  const [page] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.id, pageId), eq(pages.userId, userId)))
    .limit(1);
  if (!page) throw new Error("Page not found");
  return page;
}

async function assertAgentOwned(userId: string, agentId: string | null | undefined) {
  if (!agentId) return null;
  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.userId, userId)))
    .limit(1);
  if (!agent) throw new Error("Agent not found");
  return agent;
}

export const pagesRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    return db.select().from(pages).where(eq(pages.userId, ctx.user.id)).orderBy(desc(pages.updatedAt));
  }),

  get: authedProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    return assertPageOwned(ctx.user.id, input.id);
  }),

  create: authedProcedure
    .input(
      z.object({
        title: z.string().trim().min(1).optional(),
        markdown: z.string().default(""),
        lexicalState: lexicalStateSchema,
        agentId: z.string().uuid().nullable().optional(),
        sourceSessionId: z.string().uuid().nullable().optional(),
        sourceMessageId: z.string().uuid().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertAgentOwned(ctx.user.id, input.agentId);
      const markdown = input.markdown;
      const [page] = await db
        .insert(pages)
        .values({
          userId: ctx.user.id,
          agentId: input.agentId ?? null,
          sourceSessionId: input.sourceSessionId ?? null,
          sourceMessageId: input.sourceMessageId ?? null,
          title: input.title || pageTitleFromMarkdown(markdown),
          markdown,
          lexicalState: input.lexicalState ?? createPageLexicalState(markdown),
          plainText: derivePlainText(markdown),
          lastEditedBy: "human",
        })
        .returning();
      await createPageVersion({ page, sourceType: "human" });
      return page;
    }),

  update: authedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().trim().min(1).optional(),
        markdown: z.string().optional(),
        lexicalState: lexicalStateSchema,
        lastEditedBy: z.enum(["human", "agent", "system"]).default("human"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const currentPage = await assertPageOwned(ctx.user.id, input.id);
      const nextVersion = currentPage.currentVersion + 1;
      const updates: Partial<typeof pages.$inferInsert> = {
        updatedAt: new Date(),
        lastEditedBy: input.lastEditedBy,
        currentVersion: nextVersion,
      };
      if (input.title) updates.title = input.title;
      if (input.markdown !== undefined) {
        updates.markdown = input.markdown;
        updates.plainText = derivePlainText(input.markdown);
        updates.lexicalState = input.lexicalState ?? createPageLexicalState(input.markdown);
      } else if (input.lexicalState) {
        updates.lexicalState = input.lexicalState;
      }
      const [page] = await db.update(pages).set(updates).where(eq(pages.id, input.id)).returning();
      await createPageVersion({ page, sourceType: input.lastEditedBy, beforeMarkdown: currentPage.markdown });
      return page;
    }),

  delete: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await assertPageOwned(ctx.user.id, input.id);
    await db.delete(pages).where(eq(pages.id, input.id));
    return { success: true };
  }),

  createFromChatMessage: authedProcedure
    .input(z.object({ messageId: z.string().uuid(), title: z.string().trim().min(1).optional() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .select({
          messageId: messages.id,
          content: messages.content,
          sessionId: messages.sessionId,
          agentId: chatSessions.agentId,
        })
        .from(messages)
        .innerJoin(chatSessions, eq(messages.sessionId, chatSessions.id))
        .where(and(eq(messages.id, input.messageId), eq(chatSessions.userId, ctx.user.id)))
        .limit(1);
      if (!row) throw new Error("Message not found");
      const [page] = await db
        .insert(pages)
        .values({
          userId: ctx.user.id,
          agentId: row.agentId,
          sourceSessionId: row.sessionId,
          sourceMessageId: row.messageId,
          title: input.title || pageTitleFromMarkdown(row.content, "Chat Page"),
          markdown: row.content,
          lexicalState: createPageLexicalState(row.content),
          plainText: derivePlainText(row.content),
          lastEditedBy: "agent",
          metadata: { createdFrom: "chat-message" },
        })
        .returning();
      await createPageVersion({ page, sourceType: "agent", sourceMessageId: row.messageId });
      return page;
    }),

  comments: authedProcedure.input(z.object({ pageId: z.string().uuid() })).query(async ({ ctx, input }) => {
    await assertPageOwned(ctx.user.id, input.pageId);
    return db
      .select()
      .from(pageComments)
      .where(eq(pageComments.pageId, input.pageId))
      .orderBy(desc(pageComments.createdAt));
  }),

  addComment: authedProcedure
    .input(
      z.object({
        pageId: z.string().uuid(),
        body: z.string().trim().min(1),
        agentId: z.string().uuid().nullable().optional(),
        authorType: z.enum(["human", "agent", "system"]).default("human"),
        selectionStart: z.number().int().min(0).optional(),
        selectionEnd: z.number().int().min(0).optional(),
        quotedText: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertPageOwned(ctx.user.id, input.pageId);
      await assertAgentOwned(ctx.user.id, input.agentId);
      const [comment] = await db
        .insert(pageComments)
        .values({
          pageId: input.pageId,
          userId: ctx.user.id,
          agentId: input.agentId ?? null,
          authorType: input.authorType as PageAuthorType,
          body: input.body,
          selectionStart: input.selectionStart,
          selectionEnd: input.selectionEnd,
          quotedText: input.quotedText,
        })
        .returning();
      return comment;
    }),

  applyCopilotEdit: authedProcedure
    .input(
      z.object({
        pageId: z.string().uuid(),
        instruction: z.string().trim().min(1),
        action: z.enum(["append", "prepend", "replace-selection"]).default("append"),
        agentId: z.string().uuid().nullable().optional(),
        sourceMessageId: z.string().uuid().nullable().optional(),
        selectionStart: z.number().int().min(0).optional(),
        selectionEnd: z.number().int().min(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const page = await assertPageOwned(ctx.user.id, input.pageId);
      await assertAgentOwned(ctx.user.id, input.agentId);
      const beforeMarkdown = page.markdown;
      const afterMarkdown = applyPageCopilotMarkdownEdit(beforeMarkdown, input);
      const nextVersion = page.currentVersion + 1;
      const [updated] = await db
        .update(pages)
        .set({
          markdown: afterMarkdown,
          lexicalState: createPageLexicalState(afterMarkdown),
          plainText: derivePlainText(afterMarkdown),
          lastEditedBy: "agent",
          currentVersion: nextVersion,
          updatedAt: new Date(),
        })
        .where(eq(pages.id, input.pageId))
        .returning();
      await db.insert(pageAgentEdits).values({
        pageId: input.pageId,
        userId: ctx.user.id,
        agentId: input.agentId ?? null,
        sourceMessageId: input.sourceMessageId ?? null,
        instruction: input.instruction,
        action: input.action,
        selectionStart: input.selectionStart,
        selectionEnd: input.selectionEnd,
        beforeMarkdown,
        afterMarkdown,
      });
      await createPageVersion({
        page: updated,
        sourceType: "agent",
        beforeMarkdown,
        agentId: input.agentId ?? null,
        sourceMessageId: input.sourceMessageId ?? null,
      });
      return updated;
    }),

  importMarkdown: authedProcedure
    .input(z.object({ pageId: z.string().uuid(), markdown: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentPage = await assertPageOwned(ctx.user.id, input.pageId);
      const nextVersion = currentPage.currentVersion + 1;
      const [page] = await db
        .update(pages)
        .set({
          markdown: input.markdown,
          lexicalState: createPageLexicalState(input.markdown),
          plainText: derivePlainText(input.markdown),
          lastEditedBy: "human",
          currentVersion: nextVersion,
          updatedAt: new Date(),
        })
        .where(eq(pages.id, input.pageId))
        .returning();
      await createPageVersion({ page, sourceType: "import", beforeMarkdown: currentPage.markdown });
      return page;
    }),

  versions: authedProcedure.input(z.object({ pageId: z.string().uuid() })).query(async ({ ctx, input }) => {
    await assertPageOwned(ctx.user.id, input.pageId);
    return db
      .select()
      .from(pageVersions)
      .where(eq(pageVersions.pageId, input.pageId))
      .orderBy(desc(pageVersions.versionNumber));
  }),

  compareVersions: authedProcedure
    .input(
      z.object({ pageId: z.string().uuid(), fromVersion: z.number().int().min(1), toVersion: z.number().int().min(1) }),
    )
    .query(async ({ ctx, input }) => {
      await assertPageOwned(ctx.user.id, input.pageId);
      const [from] = await db
        .select()
        .from(pageVersions)
        .where(and(eq(pageVersions.pageId, input.pageId), eq(pageVersions.versionNumber, input.fromVersion)))
        .limit(1);
      const [to] = await db
        .select()
        .from(pageVersions)
        .where(and(eq(pageVersions.pageId, input.pageId), eq(pageVersions.versionNumber, input.toVersion)))
        .limit(1);
      if (!from || !to) throw new Error("Version not found");
      return {
        from,
        to,
        diffSummary: buildMarkdownDiffSummary(from.markdown, to.markdown),
      };
    }),

  restoreVersion: authedProcedure
    .input(z.object({ pageId: z.string().uuid(), versionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const currentPage = await assertPageOwned(ctx.user.id, input.pageId);
      const [version] = await db
        .select()
        .from(pageVersions)
        .where(
          and(
            eq(pageVersions.id, input.versionId),
            eq(pageVersions.pageId, input.pageId),
            eq(pageVersions.userId, ctx.user.id),
          ),
        )
        .limit(1);
      if (!version) throw new Error("Version not found");
      const nextVersion = currentPage.currentVersion + 1;
      const [page] = await db
        .update(pages)
        .set({
          title: version.title,
          markdown: version.markdown,
          lexicalState: version.lexicalState,
          plainText: version.plainText,
          lastEditedBy: "human",
          currentVersion: nextVersion,
          updatedAt: new Date(),
        })
        .where(eq(pages.id, input.pageId))
        .returning();
      await createPageVersion({ page, sourceType: "restore", beforeMarkdown: currentPage.markdown });
      return page;
    }),

  exportMarkdown: authedProcedure.input(z.object({ pageId: z.string().uuid() })).query(async ({ ctx, input }) => {
    const page = await assertPageOwned(ctx.user.id, input.pageId);
    return {
      title: page.title,
      filename: `${
        page.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "page"
      }.md`,
      markdown: page.markdown,
    };
  }),
});
