import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { globalToolRegistry } from "@agenthub/agent-runtime";
import { providerRegistry } from "@agenthub/ai-providers";
import { createAgentBuilderDraft, agentBuilderPatchSchema } from "../agent-builder";
import { db } from "../db";
import { agents, installedSkills, knowledgeBases } from "../db/schema";
import { authedProcedure, router } from "../trpc";

function parseJsonStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export const agentBuilderRouter = router({
  preview: authedProcedure
    .input(
      z.object({
        request: z.string().min(1).max(4000),
        agentId: z.string().uuid().optional().nullable(),
        current: agentBuilderPatchSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [agent] = input.agentId
        ? await db
            .select()
            .from(agents)
            .where(and(eq(agents.id, input.agentId), eq(agents.userId, ctx.user.id)))
            .limit(1)
        : [];

      const [models, kbs, skills] = await Promise.all([
        providerRegistry.listAllModels(),
        db
          .select({
            id: knowledgeBases.id,
            name: knowledgeBases.name,
            description: knowledgeBases.description,
          })
          .from(knowledgeBases)
          .where(eq(knowledgeBases.userId, ctx.user.id)),
        db
          .select({
            slug: installedSkills.slug,
            name: installedSkills.name,
            description: installedSkills.description,
          })
          .from(installedSkills)
          .where(eq(installedSkills.userId, ctx.user.id)),
      ]);

      return createAgentBuilderDraft({
        request: input.request,
        currentAgent:
          input.current ??
          (agent
            ? {
                name: agent.name,
                description: agent.description,
                avatar: agent.avatar,
                systemPrompt: agent.systemPrompt,
                model: agent.model,
                routeStrategy: agent.routeStrategy,
                fallbackModelIds: parseJsonStringArray(agent.fallbackModelIds),
                tools: parseJsonStringArray(agent.tools),
                toolProfile: agent.toolProfile,
                deniedTools: parseJsonStringArray(agent.deniedTools),
                memoryEnabled: agent.memoryEnabled,
                knowledgeBaseId: agent.knowledgeBaseId,
                openingMessage: agent.openingMessage,
                openingQuestions: parseJsonStringArray(agent.openingQuestions),
              }
            : null),
        availableModels: models.map((model) => ({
          id: model.id,
          name: model.name,
          providerId: model.providerId,
        })),
        availableTools: [
          ...globalToolRegistry.list().map((tool) => ({
            id: tool.name,
            name: tool.name,
            description: tool.description,
          })),
          ...skills.map((skill) => ({
            id: `skill:${skill.slug}`,
            name: skill.name,
            description: skill.description || undefined,
          })),
        ],
        knowledgeBases: kbs,
      });
    }),
});
