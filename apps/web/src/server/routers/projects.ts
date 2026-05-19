import { z } from "zod";
import { and, desc, eq, ilike } from "drizzle-orm";
import { router, authedProcedure } from "../trpc";
import { db } from "../db";
import {
  agentTasks,
  agents,
  automations,
  chatSessions,
  knowledgeBases,
  pages,
  projectAgents,
  projectAutomations,
  projectChats,
  projectKnowledgeBases,
  projectNotebookDocuments,
  projectPages,
  projectResources,
  projectTasks,
  projects,
  resources,
} from "../db/schema";

const resourceKindSchema = z.enum(["agent", "chat", "page", "knowledgeBase", "task", "resource", "automation"]);
const notebookSourceTypeSchema = z.enum(["note", "page", "file", "url", "chat", "manual"]);
type ProjectResourceKind = z.infer<typeof resourceKindSchema>;

export const PROJECT_RESOURCE_TABLES: Record<ProjectResourceKind, string> = {
  agent: "project_agents",
  chat: "project_chats",
  page: "project_pages",
  knowledgeBase: "project_knowledge_bases",
  task: "project_tasks",
  resource: "project_resources",
  automation: "project_automations",
};

async function assertProjectOwned(userId: string, projectId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  if (!project) throw new Error("Project not found");
  return project;
}

async function assertResourceOwned(userId: string, kind: ProjectResourceKind, resourceId: string) {
  if (kind === "agent") {
    const [row] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, resourceId), eq(agents.userId, userId)))
      .limit(1);
    if (!row) throw new Error("Agent not found");
  } else if (kind === "chat") {
    const [row] = await db
      .select({ id: chatSessions.id })
      .from(chatSessions)
      .where(and(eq(chatSessions.id, resourceId), eq(chatSessions.userId, userId)))
      .limit(1);
    if (!row) throw new Error("Chat not found");
  } else if (kind === "page") {
    const [row] = await db
      .select({ id: pages.id })
      .from(pages)
      .where(and(eq(pages.id, resourceId), eq(pages.userId, userId)))
      .limit(1);
    if (!row) throw new Error("Page not found");
  } else if (kind === "knowledgeBase") {
    const [row] = await db
      .select({ id: knowledgeBases.id })
      .from(knowledgeBases)
      .where(and(eq(knowledgeBases.id, resourceId), eq(knowledgeBases.userId, userId)))
      .limit(1);
    if (!row) throw new Error("Knowledge base not found");
  } else if (kind === "task") {
    const [row] = await db
      .select({ id: agentTasks.id })
      .from(agentTasks)
      .where(and(eq(agentTasks.id, resourceId), eq(agentTasks.userId, userId)))
      .limit(1);
    if (!row) throw new Error("Task not found");
  } else if (kind === "resource") {
    const [row] = await db
      .select({ id: resources.id })
      .from(resources)
      .where(and(eq(resources.id, resourceId), eq(resources.userId, userId)))
      .limit(1);
    if (!row) throw new Error("Resource not found");
  } else {
    const [row] = await db
      .select({ id: automations.id })
      .from(automations)
      .where(and(eq(automations.id, resourceId), eq(automations.userId, userId)))
      .limit(1);
    if (!row) throw new Error("Automation not found");
  }
}

async function linkProjectResource(userId: string, projectId: string, kind: ProjectResourceKind, resourceId: string) {
  if (kind === "agent") {
    await db.insert(projectAgents).values({ projectId, userId, agentId: resourceId }).onConflictDoNothing();
  } else if (kind === "chat") {
    await db.insert(projectChats).values({ projectId, userId, sessionId: resourceId }).onConflictDoNothing();
  } else if (kind === "page") {
    await db.insert(projectPages).values({ projectId, userId, pageId: resourceId }).onConflictDoNothing();
  } else if (kind === "knowledgeBase") {
    await db
      .insert(projectKnowledgeBases)
      .values({ projectId, userId, knowledgeBaseId: resourceId })
      .onConflictDoNothing();
  } else if (kind === "task") {
    await db.insert(projectTasks).values({ projectId, userId, taskId: resourceId }).onConflictDoNothing();
  } else if (kind === "resource") {
    await db.insert(projectResources).values({ projectId, userId, resourceId }).onConflictDoNothing();
  } else {
    await db.insert(projectAutomations).values({ projectId, userId, automationId: resourceId }).onConflictDoNothing();
  }
}

async function unlinkProjectResource(projectId: string, kind: ProjectResourceKind, resourceId: string) {
  if (kind === "agent") {
    await db
      .delete(projectAgents)
      .where(and(eq(projectAgents.projectId, projectId), eq(projectAgents.agentId, resourceId)));
  } else if (kind === "chat") {
    await db
      .delete(projectChats)
      .where(and(eq(projectChats.projectId, projectId), eq(projectChats.sessionId, resourceId)));
  } else if (kind === "page") {
    await db
      .delete(projectPages)
      .where(and(eq(projectPages.projectId, projectId), eq(projectPages.pageId, resourceId)));
  } else if (kind === "knowledgeBase") {
    await db
      .delete(projectKnowledgeBases)
      .where(
        and(eq(projectKnowledgeBases.projectId, projectId), eq(projectKnowledgeBases.knowledgeBaseId, resourceId)),
      );
  } else if (kind === "task") {
    await db
      .delete(projectTasks)
      .where(and(eq(projectTasks.projectId, projectId), eq(projectTasks.taskId, resourceId)));
  } else if (kind === "resource") {
    await db
      .delete(projectResources)
      .where(and(eq(projectResources.projectId, projectId), eq(projectResources.resourceId, resourceId)));
  } else {
    await db
      .delete(projectAutomations)
      .where(and(eq(projectAutomations.projectId, projectId), eq(projectAutomations.automationId, resourceId)));
  }
}

async function loadProjectScope(projectId: string) {
  const [
    projectAgentsRows,
    projectChatsRows,
    projectPagesRows,
    projectKbRows,
    projectTaskRows,
    projectResourceRows,
    projectAutomationRows,
  ] = await Promise.all([
    db
      .select({ agent: agents })
      .from(projectAgents)
      .innerJoin(agents, eq(projectAgents.agentId, agents.id))
      .where(eq(projectAgents.projectId, projectId)),
    db
      .select({ chat: chatSessions })
      .from(projectChats)
      .innerJoin(chatSessions, eq(projectChats.sessionId, chatSessions.id))
      .where(eq(projectChats.projectId, projectId)),
    db
      .select({ page: pages })
      .from(projectPages)
      .innerJoin(pages, eq(projectPages.pageId, pages.id))
      .where(eq(projectPages.projectId, projectId)),
    db
      .select({ knowledgeBase: knowledgeBases })
      .from(projectKnowledgeBases)
      .innerJoin(knowledgeBases, eq(projectKnowledgeBases.knowledgeBaseId, knowledgeBases.id))
      .where(eq(projectKnowledgeBases.projectId, projectId)),
    db
      .select({ task: agentTasks })
      .from(projectTasks)
      .innerJoin(agentTasks, eq(projectTasks.taskId, agentTasks.id))
      .where(eq(projectTasks.projectId, projectId)),
    db
      .select({ resource: resources })
      .from(projectResources)
      .innerJoin(resources, eq(projectResources.resourceId, resources.id))
      .where(eq(projectResources.projectId, projectId)),
    db
      .select({ automation: automations })
      .from(projectAutomations)
      .innerJoin(automations, eq(projectAutomations.automationId, automations.id))
      .where(eq(projectAutomations.projectId, projectId)),
  ]);
  return {
    agents: projectAgentsRows.map((row) => row.agent),
    chats: projectChatsRows.map((row) => row.chat),
    pages: projectPagesRows.map((row) => row.page),
    knowledgeBases: projectKbRows.map((row) => row.knowledgeBase),
    tasks: projectTaskRows.map((row) => row.task),
    resources: projectResourceRows.map((row) => row.resource),
    automations: projectAutomationRows.map((row) => row.automation),
  };
}

export const projectsRouter = router({
  list: authedProcedure.query(async ({ ctx }) => {
    return db.select().from(projects).where(eq(projects.userId, ctx.user.id)).orderBy(desc(projects.updatedAt));
  }),

  get: authedProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    return assertProjectOwned(ctx.user.id, input.id);
  }),

  create: authedProcedure
    .input(z.object({ name: z.string().trim().min(1), description: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [project] = await db
        .insert(projects)
        .values({
          userId: ctx.user.id,
          name: input.name,
          description: input.description || null,
        })
        .returning();
      return project;
    }),

  update: authedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().trim().min(1).optional(),
        description: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertProjectOwned(ctx.user.id, input.id);
      const [project] = await db
        .update(projects)
        .set({
          ...(input.name && { name: input.name }),
          ...(input.description !== undefined && { description: input.description }),
          updatedAt: new Date(),
        })
        .where(eq(projects.id, input.id))
        .returning();
      return project;
    }),

  delete: authedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await assertProjectOwned(ctx.user.id, input.id);
    await db.delete(projects).where(eq(projects.id, input.id));
    return { success: true };
  }),

  scope: authedProcedure.input(z.object({ projectId: z.string().uuid() })).query(async ({ ctx, input }) => {
    const project = await assertProjectOwned(ctx.user.id, input.projectId);
    return { project, ...(await loadProjectScope(project.id)) };
  }),

  linkResource: authedProcedure
    .input(z.object({ projectId: z.string().uuid(), kind: resourceKindSchema, resourceId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertProjectOwned(ctx.user.id, input.projectId);
      await assertResourceOwned(ctx.user.id, input.kind, input.resourceId);
      await linkProjectResource(ctx.user.id, input.projectId, input.kind, input.resourceId);
      await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, input.projectId));
      return { success: true, table: PROJECT_RESOURCE_TABLES[input.kind] };
    }),

  unlinkResource: authedProcedure
    .input(z.object({ projectId: z.string().uuid(), kind: resourceKindSchema, resourceId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertProjectOwned(ctx.user.id, input.projectId);
      await unlinkProjectResource(input.projectId, input.kind, input.resourceId);
      await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, input.projectId));
      return { success: true };
    }),

  notebookDocuments: authedProcedure.input(z.object({ projectId: z.string().uuid() })).query(async ({ ctx, input }) => {
    await assertProjectOwned(ctx.user.id, input.projectId);
    return db
      .select()
      .from(projectNotebookDocuments)
      .where(eq(projectNotebookDocuments.projectId, input.projectId))
      .orderBy(desc(projectNotebookDocuments.updatedAt));
  }),

  createNotebookDocument: authedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        title: z.string().trim().min(1),
        content: z.string().trim().min(1),
        sourceType: notebookSourceTypeSchema.default("note"),
        sourceId: z.string().uuid().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertProjectOwned(ctx.user.id, input.projectId);
      const [doc] = await db
        .insert(projectNotebookDocuments)
        .values({
          projectId: input.projectId,
          userId: ctx.user.id,
          title: input.title,
          content: input.content,
          sourceType: input.sourceType,
          sourceId: input.sourceId ?? null,
        })
        .returning();
      return doc;
    }),

  updateNotebookDocument: authedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().trim().min(1).optional(),
        content: z.string().trim().min(1).optional(),
        sourceType: notebookSourceTypeSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await db
        .select()
        .from(projectNotebookDocuments)
        .where(and(eq(projectNotebookDocuments.id, input.id), eq(projectNotebookDocuments.userId, ctx.user.id)))
        .limit(1);
      if (!existing) throw new Error("Notebook document not found");
      const [doc] = await db
        .update(projectNotebookDocuments)
        .set({
          ...(input.title && { title: input.title }),
          ...(input.content && { content: input.content }),
          ...(input.sourceType && { sourceType: input.sourceType }),
          updatedAt: new Date(),
        })
        .where(eq(projectNotebookDocuments.id, input.id))
        .returning();
      return doc;
    }),

  deleteNotebookDocument: authedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(projectNotebookDocuments)
        .where(and(eq(projectNotebookDocuments.id, input.id), eq(projectNotebookDocuments.userId, ctx.user.id)));
      return { success: true };
    }),

  searchNotebookDocuments: authedProcedure
    .input(
      z.object({
        projectId: z.string().uuid(),
        query: z.string().trim().min(1),
        limit: z.number().int().min(1).max(20).default(5),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertProjectOwned(ctx.user.id, input.projectId);
      const pattern = `%${input.query}%`;
      return db
        .select()
        .from(projectNotebookDocuments)
        .where(
          and(
            eq(projectNotebookDocuments.projectId, input.projectId),
            ilike(projectNotebookDocuments.content, pattern),
          ),
        )
        .orderBy(desc(projectNotebookDocuments.updatedAt))
        .limit(input.limit);
    }),
});
