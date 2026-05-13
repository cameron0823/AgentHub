import { pgTable, text, integer, real, boolean, timestamp, jsonb, uuid, vector, index, primaryKey, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  role: text("role").notNull().default("user"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  refresh_token: text("refresh_token"),
  access_token: text("access_token"),
  expires_at: integer("expires_at"),
  token_type: text("token_type"),
  scope: text("scope"),
  id_token: text("id_token"),
  session_state: text("session_state"),
});

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable("verification_tokens", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull(),
  expires: timestamp("expires", { mode: "date" }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.identifier, table.token] }),
]);

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  avatar: text("avatar"),
  systemPrompt: text("system_prompt").notNull(),
  model: text("model").default("ollama:qwen2.5:7b"),
  temperature: real("temperature").default(0.7),
  maxTokens: integer("max_tokens").default(4096),
  tools: text("tools").default("[]"),
  memoryEnabled: boolean("memory_enabled").default(true),
  knowledgeBaseId: uuid("knowledge_base_id").references(() => knowledgeBases.id, { onDelete: "set null" }),
  tags: text("tags").default("[]"),
  isPublic: boolean("is_public").default(false),
  openingMessage: text("opening_message"),
  openingQuestions: jsonb("opening_questions").default([]),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const agentGroups = pgTable("agent_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  pattern: text("pattern", { enum: ["sequential", "parallel", "supervisor", "debate", "groupchat"] }).notNull().default("sequential"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const groupMembers = pgTable("group_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => agentGroups.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  role: text("role"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const chatSessions = pgTable("chat_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
  groupId: uuid("group_id").references(() => agentGroups.id, { onDelete: "set null" }),
  parentMessageId: uuid("parent_message_id"),
  title: text("title").default("New Chat"),
  model: text("model").default("ollama:qwen2.5:7b"),
  metadata: jsonb("metadata"),
  isPublic: boolean("is_public").default(false),
  publicSlug: varchar("public_slug", { length: 20 }).unique(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => chatSessions.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id"),
  role: text("role", { enum: ["user", "assistant", "system", "tool"] }).notNull(),
  content: text("content").notNull(),
  reasoning: text("reasoning"),
  model: text("model"),
  toolCalls: jsonb("tool_calls"),
  artifacts: jsonb("artifacts"),
  metadata: jsonb("metadata"),
  tokensUsed: integer("tokens_used"),
  latencyMs: integer("latency_ms"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const memoryEntries = pgTable("memory_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
  category: text("category").notNull(),
  key: text("key").notNull(),
  value: text("value").notNull(),
  confidence: real("confidence").notNull().default(1),
  sourceMessageId: uuid("source_message_id").references(() => messages.id, { onDelete: "set null" }),
  status: text("status", { enum: ["accepted", "proposed", "rejected", "archived"] }).notNull().default("accepted"),
  isEdited: boolean("is_edited").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const knowledgeBases = pgTable("knowledge_bases", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  embeddingModel: text("embedding_model").default("nomic-embed-text"),
  chunkSize: integer("chunk_size").default(1000),
  chunkOverlap: integer("chunk_overlap").default(200),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  knowledgeBaseId: uuid("knowledge_base_id").references(() => knowledgeBases.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  s3Key: text("s3_key").notNull(),
  s3Url: text("s3_url").notNull(),
  content: text("content"),
  metadata: jsonb("metadata"),
  status: text("status", { enum: ["pending", "processing", "indexed", "error"] }).notNull().default("pending"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const documentChunks = pgTable("document_chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  embedding: vector("embedding", { dimensions: 768 }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
}, (table) => [
  index("embedding_index").using("hnsw", table.embedding.op("vector_cosine_ops")),
]);

export const files = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  s3Key: text("s3_key").notNull(),
  s3Url: text("s3_url").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const providerCredentials = pgTable("provider_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  providerId: text("provider_id").notNull(),
  providerName: text("provider_name").notNull(),
  authType: text("auth_type", { enum: ["api_key", "oauth"] }).notNull().default("api_key"),
  apiKey: text("api_key"),
  baseUrl: text("base_url"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at", { mode: "date" }),
  scope: text("scope"),
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
}, (table) => [
  index("provider_user_idx").on(table.providerId, table.userId),
]);

export const mcpServers = pgTable("mcp_servers", {
  id:        uuid("id").primaryKey().defaultRandom(),
  userId:    uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name:      text("name").notNull(),
  transport: text("transport").notNull(),
  command:   text("command"),
  args:      text("args"),
  env:       text("env"),
  url:       text("url"),
  enabled:   boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const promptLibrary = pgTable("prompt_library", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  tags: text("tags").array().default([]),
  isPinned: boolean("is_pinned").default(false),
  useCount: integer("use_count").default(0),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const automations = pgTable("automations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  prompt: text("prompt").notNull(),
  cronExpression: text("cron_expression").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  lastRunAt: timestamp("last_run_at", { mode: "date" }),
  webhookUrl: text("webhook_url"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const automationRuns = pgTable("automation_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  automationId: uuid("automation_id").notNull().references(() => automations.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["pending", "running", "success", "error"] }).notNull().default("pending"),
  output: text("output"),
  error: text("error"),
  startedAt: timestamp("started_at", { mode: "date" }),
  completedAt: timestamp("completed_at", { mode: "date" }),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  agents: many(agents),
  sessions: many(chatSessions),
  knowledgeBases: many(knowledgeBases),
  documents: many(documents),
  files: many(files),
}));

export const agentsRelations = relations(agents, ({ one, many }) => ({
  user: one(users, { fields: [agents.userId], references: [users.id] }),
  knowledgeBase: one(knowledgeBases, { fields: [agents.knowledgeBaseId], references: [knowledgeBases.id] }),
  memories: many(memoryEntries),
}));

export const chatSessionsRelations = relations(chatSessions, ({ one, many }) => ({
  user: one(users, { fields: [chatSessions.userId], references: [users.id] }),
  agent: one(agents, { fields: [chatSessions.agentId], references: [agents.id] }),
  group: one(agentGroups, { fields: [chatSessions.groupId], references: [agentGroups.id] }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  session: one(chatSessions, { fields: [messages.sessionId], references: [chatSessions.id] }),
}));

export const knowledgeBasesRelations = relations(knowledgeBases, ({ one, many }) => ({
  user: one(users, { fields: [knowledgeBases.userId], references: [users.id] }),
  documents: many(documents),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  knowledgeBase: one(knowledgeBases, { fields: [documents.knowledgeBaseId], references: [knowledgeBases.id] }),
  chunks: many(documentChunks),
}));

export type User = typeof users.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type AgentGroup = typeof agentGroups.$inferSelect;
export type ChatSession = typeof chatSessions.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type MemoryEntry = typeof memoryEntries.$inferSelect;
export type KnowledgeBase = typeof knowledgeBases.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type DocumentChunk = typeof documentChunks.$inferSelect;
export type File = typeof files.$inferSelect;
export type McpServer = typeof mcpServers.$inferSelect;
export type Automation = typeof automations.$inferSelect;
export type AutomationRun = typeof automationRuns.$inferSelect;
