import { router, publicProcedure } from "../trpc";
import { agentsRouter, agentGroupsRouter } from "./agents";
import { sessionsRouter, messagesRouter } from "./sessions";
import { memoryEntriesRouter } from "./memory";
import { kbRouter, filesRouter } from "./kb";
import { providersRouter, providerCredentialsRouter } from "./providers";
import { marketplaceRouter } from "./marketplace";
import { mcpRouter } from "./mcp";
import { promptLibraryRouter } from "./promptLibrary";

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: "ok" })),
  marketplace: marketplaceRouter,
  providers: providersRouter,
  agents: agentsRouter,
  agentGroups: agentGroupsRouter,
  memoryEntries: memoryEntriesRouter,
  sessions: sessionsRouter,
  messages: messagesRouter,
  knowledgeBases: kbRouter,
  files: filesRouter,
  providerCredentials: providerCredentialsRouter,
  mcpServers: mcpRouter,
  promptLibrary: promptLibraryRouter,
});

export type AppRouter = typeof appRouter;
