import { router, publicProcedure } from "../trpc";
import { agentsRouter, agentGroupsRouter } from "./agents";
import { agentBuilderRouter } from "./agentBuilder";
import { sessionsRouter, messagesRouter } from "./sessions";
import { memoryEntriesRouter } from "./memory";
import { kbRouter, filesRouter } from "./kb";
import { providersRouter, providerCredentialsRouter } from "./providers";
import { marketplaceRouter } from "./marketplace";
import { skillsRouter } from "./skills";
import { mcpRouter } from "./mcp";
import { promptLibraryRouter } from "./promptLibrary";
import { analyticsRouter } from "./analytics";
import { automationsRouter } from "./automations";
import { tasksRouter } from "./tasks";
import { adminRouter } from "./admin";
import { apiKeysRouter } from "./apiKeys";
import { channelsRouter } from "./channels";
import { trustRouter } from "./trust";
import { heterogeneousRouter } from "./heterogeneous";
import { reviewRouter } from "./review";
import { sandboxRouter } from "./sandbox";
import { mcpGovernanceRouter } from "./mcpGovernance";
import { pagesRouter } from "./pages";
import { projectsRouter } from "./projects";
import { dailyBriefsRouter } from "./dailyBriefs";
import { agentSignalRouter } from "./agentSignal";
import { workspacesRouter } from "./workspaces";
import { quotasRouter } from "./quotas";
import { a2aRouter } from "./a2a";

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: "ok" })),
  marketplace: marketplaceRouter,
  skills: skillsRouter,
  providers: providersRouter,
  agents: agentsRouter,
  agentBuilder: agentBuilderRouter,
  agentGroups: agentGroupsRouter,
  memoryEntries: memoryEntriesRouter,
  sessions: sessionsRouter,
  messages: messagesRouter,
  knowledgeBases: kbRouter,
  files: filesRouter,
  providerCredentials: providerCredentialsRouter,
  mcpServers: mcpRouter,
  mcpGovernance: mcpGovernanceRouter,
  promptLibrary: promptLibraryRouter,
  analytics: analyticsRouter,
  automations: automationsRouter,
  tasks: tasksRouter,
  admin: adminRouter,
  apiKeys: apiKeysRouter,
  channels: channelsRouter,
  trust: trustRouter,
  heterogeneous: heterogeneousRouter,
  review: reviewRouter,
  sandbox: sandboxRouter,
  pages: pagesRouter,
  projects: projectsRouter,
  workspaces: workspacesRouter,
  quotas: quotasRouter,
  a2a: a2aRouter,
  dailyBriefs: dailyBriefsRouter,
  agentSignal: agentSignalRouter,
});

export type AppRouter = typeof appRouter;
