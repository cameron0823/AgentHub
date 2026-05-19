import {
  pgTable,
  text,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
  uuid,
  vector,
  index,
  primaryKey,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import type { AutomationWorkflowDefinition } from "@/lib/workflow-designer";

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
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
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
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.identifier, table.token] })],
);

export const userQuotas = pgTable(
  "user_quotas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    messagesSent: integer("messages_sent").notNull().default(0),
    tokensUsed: integer("tokens_used").notNull().default(0),
    storageUsed: integer("storage_used").notNull().default(0),
    apiCalls: integer("api_calls").notNull().default(0),
    plan: text("plan", { enum: ["free", "pro", "team", "enterprise"] })
      .notNull()
      .default("free"),
    maxMessages: integer("max_messages").notNull().default(100),
    maxTokens: integer("max_tokens").notNull().default(1_000_000),
    maxStorage: integer("max_storage").notNull().default(1_073_741_824),
    maxApiCalls: integer("max_api_calls").notNull().default(5_000),
    resetAt: timestamp("reset_at", { mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("user_quotas_user_idx").on(table.userId), index("user_quotas_reset_idx").on(table.resetAt)],
);
export type UserQuota = typeof userQuotas.$inferSelect;

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logo: text("logo"),
    metadata: jsonb("metadata").notNull().default({ plan: "free", features: [] }),
    defaultLocale: text("default_locale").notNull().default("en-US"),
    defaultModel: text("default_model"),
    systemPrompt: text("system_prompt"),
    brandColor: varchar("brand_color", { length: 7 }).notNull().default("#1890ff"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { mode: "date" }),
  },
  (table) => [index("workspaces_deleted_idx").on(table.deletedAt)],
);
export type Workspace = typeof workspaces.$inferSelect;

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "admin", "member", "viewer"] })
      .notNull()
      .default("member"),
    permissions: jsonb("permissions").notNull().default([]),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    joinedAt: timestamp("joined_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("workspace_members_workspace_user_idx").on(table.workspaceId, table.userId),
    index("workspace_members_user_idx").on(table.userId),
  ],
);
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;

export const workspaceInvitations = pgTable(
  "workspace_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role", { enum: ["admin", "member", "viewer"] })
      .notNull()
      .default("member"),
    token: text("token").notNull().unique(),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    acceptedAt: timestamp("accepted_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("workspace_invitations_workspace_idx").on(table.workspaceId),
    index("workspace_invitations_email_idx").on(table.email),
  ],
);
export type WorkspaceInvitation = typeof workspaceInvitations.$inferSelect;

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  avatar: text("avatar"),
  systemPrompt: text("system_prompt").notNull(),
  model: text("model").default("ollama:qwen2.5:7b"),
  routeStrategy: text("route_strategy", {
    enum: ["fixed", "local-first", "speed-first", "cost-first", "reasoning-first", "fallback-chain"],
  })
    .notNull()
    .default("fixed"),
  fallbackModelIds: jsonb("fallback_model_ids").default([]),
  voiceProvider: text("voice_provider").notNull().default("browser"),
  voiceId: text("voice_id").notNull().default("alloy"),
  voiceSpeed: real("voice_speed").notNull().default(1),
  sttProvider: text("stt_provider").notNull().default("browser"),
  handsFreeVoice: boolean("hands_free_voice").notNull().default(false),
  temperature: real("temperature").default(0.7),
  maxTokens: integer("max_tokens").default(4096),
  tools: text("tools").default("[]"),
  toolProfile: text("tool_profile", { enum: ["minimal", "research", "coding", "messaging", "admin", "full"] })
    .notNull()
    .default("full"),
  deniedTools: jsonb("denied_tools").notNull().default([]),
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
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  pattern: text("pattern", { enum: ["sequential", "parallel", "supervisor", "iterative", "debate", "groupchat"] })
    .notNull()
    .default("sequential"),
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
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
  groupId: uuid("group_id").references(() => agentGroups.id, { onDelete: "set null" }),
  parentMessageId: uuid("parent_message_id"),
  title: text("title").default("New Chat"),
  model: text("model").default("ollama:qwen2.5:7b"),
  metadata: jsonb("metadata"),
  isPublic: boolean("is_public").default(false),
  publicSlug: varchar("public_slug", { length: 20 }).unique(),
  isPinned: boolean("is_pinned").notNull().default(false),
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
  feedback: text("feedback", { enum: ["up", "down"] }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const resources = pgTable(
  "resources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    sourceMessageId: uuid("source_message_id").references(() => messages.id, { onDelete: "set null" }),
    type: text("type", { enum: ["image", "file", "chart", "document"] }).notNull(),
    source: text("source").notNull().default("image_generation"),
    uri: text("uri").notNull(),
    mimeType: text("mime_type").notNull().default("image/png"),
    prompt: text("prompt"),
    revisedPrompt: text("revised_prompt"),
    providerId: text("provider_id"),
    model: text("model"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("resources_user_idx").on(table.userId),
    index("resources_session_idx").on(table.sessionId),
    index("resources_source_message_idx").on(table.sourceMessageId),
    index("resources_source_idx").on(table.source),
  ],
);

export const dailyBriefs = pgTable(
  "daily_briefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    generatedForDate: text("generated_for_date").notNull(),
    generatedBy: text("generated_by", { enum: ["manual", "schedule", "system"] })
      .notNull()
      .default("manual"),
    status: text("status", { enum: ["ready", "error"] })
      .notNull()
      .default("ready"),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    highlights: jsonb("highlights").notNull().default([]),
    sections: jsonb("sections").notNull().default([]),
    sourceCounts: jsonb("source_counts").notNull().default({}),
    sourceWindowStart: timestamp("source_window_start", { mode: "date" }).notNull(),
    sourceWindowEnd: timestamp("source_window_end", { mode: "date" }).notNull(),
    scheduledFor: timestamp("scheduled_for", { mode: "date" }),
    generatedAt: timestamp("generated_at", { mode: "date" }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("daily_briefs_user_generated_idx").on(table.userId, table.generatedAt),
    index("daily_briefs_user_date_idx").on(table.userId, table.generatedForDate),
  ],
);

export const agentSignalReviews = pgTable(
  "agent_signal_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    generatedForDate: text("generated_for_date").notNull(),
    generatedBy: text("generated_by", { enum: ["manual", "schedule"] })
      .notNull()
      .default("schedule"),
    status: text("status", { enum: ["completed", "error"] })
      .notNull()
      .default("completed"),
    policyVersion: text("policy_version").notNull(),
    summary: text("summary").notNull(),
    sourceCounts: jsonb("source_counts").notNull().default({}),
    startedAt: timestamp("started_at", { mode: "date" }).notNull(),
    completedAt: timestamp("completed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("agent_signal_reviews_user_generated_idx").on(table.userId, table.createdAt),
    index("agent_signal_reviews_user_date_idx").on(table.userId, table.generatedForDate),
  ],
);

export const agentSignalReviewItems = pgTable(
  "agent_signal_review_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => agentSignalReviews.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    taskId: uuid("task_id").references(() => agentTasks.id, { onDelete: "set null" }),
    skillId: uuid("skill_id").references(() => installedSkills.id, { onDelete: "set null" }),
    severity: text("severity", { enum: ["info", "warning", "critical"] })
      .notNull()
      .default("info"),
    category: text("category", { enum: ["agent", "task", "skill", "tool", "workflow"] }).notNull(),
    title: text("title").notNull(),
    recommendation: text("recommendation").notNull(),
    evidence: jsonb("evidence").notNull().default({}),
    status: text("status", { enum: ["open", "acknowledged", "resolved"] })
      .notNull()
      .default("open"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("agent_signal_items_review_idx").on(table.reviewId),
    index("agent_signal_items_user_idx").on(table.userId, table.createdAt),
    index("agent_signal_items_agent_idx").on(table.agentId),
    index("agent_signal_items_task_idx").on(table.taskId),
    index("agent_signal_items_skill_idx").on(table.skillId),
  ],
);

export const pages = pgTable(
  "pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    sourceSessionId: uuid("source_session_id").references(() => chatSessions.id, { onDelete: "set null" }),
    sourceMessageId: uuid("source_message_id").references(() => messages.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    markdown: text("markdown").notNull().default(""),
    lexicalState: jsonb("lexical_state").notNull().default({}),
    plainText: text("plain_text").notNull().default(""),
    lastEditedBy: text("last_edited_by", { enum: ["human", "agent", "system"] })
      .notNull()
      .default("human"),
    currentVersion: integer("current_version").notNull().default(1),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("pages_user_updated_idx").on(table.userId, table.updatedAt),
    index("pages_source_session_idx").on(table.sourceSessionId),
    index("pages_source_message_idx").on(table.sourceMessageId),
  ],
);

export const pageComments = pgTable(
  "page_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    authorType: text("author_type", { enum: ["human", "agent", "system"] })
      .notNull()
      .default("human"),
    selectionStart: integer("selection_start"),
    selectionEnd: integer("selection_end"),
    quotedText: text("quoted_text"),
    body: text("body").notNull(),
    isResolved: boolean("is_resolved").notNull().default(false),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("page_comments_page_idx").on(table.pageId), index("page_comments_user_idx").on(table.userId)],
);

export const pageAgentEdits = pgTable(
  "page_agent_edits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    sourceMessageId: uuid("source_message_id").references(() => messages.id, { onDelete: "set null" }),
    instruction: text("instruction").notNull(),
    action: text("action", { enum: ["append", "prepend", "replace-selection"] })
      .notNull()
      .default("append"),
    selectionStart: integer("selection_start"),
    selectionEnd: integer("selection_end"),
    beforeMarkdown: text("before_markdown").notNull(),
    afterMarkdown: text("after_markdown").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("page_agent_edits_page_idx").on(table.pageId), index("page_agent_edits_user_idx").on(table.userId)],
);

export const pageVersions = pgTable(
  "page_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    sourceMessageId: uuid("source_message_id").references(() => messages.id, { onDelete: "set null" }),
    versionNumber: integer("version_number").notNull(),
    title: text("title").notNull(),
    markdown: text("markdown").notNull(),
    lexicalState: jsonb("lexical_state").notNull().default({}),
    plainText: text("plain_text").notNull().default(""),
    sourceType: text("source_type", { enum: ["human", "agent", "system", "import", "restore"] })
      .notNull()
      .default("human"),
    diffSummary: jsonb("diff_summary").notNull().default({}),
    retentionExpiresAt: timestamp("retention_expires_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("page_versions_page_version_idx").on(table.pageId, table.versionNumber),
    index("page_versions_user_idx").on(table.userId),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("projects_user_updated_idx").on(table.userId, table.updatedAt)],
);

export const projectAgents = pgTable(
  "project_agents",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.agentId] }),
    index("project_agents_agent_idx").on(table.agentId),
  ],
);

export const projectChats = pgTable(
  "project_chats",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.sessionId] }),
    index("project_chats_session_idx").on(table.sessionId),
  ],
);

export const projectPages = pgTable(
  "project_pages",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.pageId] }),
    index("project_pages_page_idx").on(table.pageId),
  ],
);

export const projectKnowledgeBases = pgTable(
  "project_knowledge_bases",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.knowledgeBaseId] }),
    index("project_kbs_kb_idx").on(table.knowledgeBaseId),
  ],
);

export const projectTasks = pgTable(
  "project_tasks",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => agentTasks.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.taskId] }),
    index("project_tasks_task_idx").on(table.taskId),
  ],
);

export const projectResources = pgTable(
  "project_resources",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.resourceId] }),
    index("project_resources_resource_idx").on(table.resourceId),
  ],
);

export const projectAutomations = pgTable(
  "project_automations",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    automationId: uuid("automation_id")
      .notNull()
      .references(() => automations.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.automationId] }),
    index("project_automations_automation_idx").on(table.automationId),
  ],
);

export const projectNotebookDocuments = pgTable(
  "project_notebook_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    sourceType: text("source_type", { enum: ["note", "page", "file", "url", "chat", "manual"] })
      .notNull()
      .default("note"),
    sourceId: uuid("source_id"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("project_notebook_docs_project_idx").on(table.projectId, table.updatedAt),
    index("project_notebook_docs_user_idx").on(table.userId),
  ],
);

export const installedSkills = pgTable(
  "installed_skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    version: text("version").notNull().default("1.0.0"),
    author: text("author"),
    license: text("license"),
    source: text("source").notNull().default("local"),
    sourceUrl: text("source_url"),
    skillMarkdown: text("skill_markdown").notNull(),
    manifest: jsonb("manifest").notNull(),
    permissions: jsonb("permissions").notNull().default({}),
    installedAt: timestamp("installed_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("installed_skills_user_slug_idx").on(table.userId, table.slug),
    index("installed_skills_user_idx").on(table.userId),
  ],
);

export const skillResources = pgTable(
  "skill_resources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => installedSkills.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    type: text("type", { enum: ["reference", "script", "template", "asset"] }).notNull(),
    content: text("content").notNull().default(""),
    mimeType: text("mime_type").notNull().default("text/markdown"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("skill_resources_skill_path_idx").on(table.skillId, table.path),
    index("skill_resources_user_idx").on(table.userId),
  ],
);

export const memoryEntries = pgTable(
  "memory_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    category: text("category").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    confidence: real("confidence").notNull().default(1),
    sourceMessageId: uuid("source_message_id").references(() => messages.id, { onDelete: "set null" }),
    status: text("status", { enum: ["accepted", "proposed", "rejected", "archived"] })
      .notNull()
      .default("accepted"),
    isEdited: boolean("is_edited").notNull().default(false),
    embedding: vector("embedding", { dimensions: 768 }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("memory_entries_embedding_idx").using("hnsw", table.embedding.op("vector_cosine_ops"))],
);

export const knowledgeBases = pgTable("knowledge_bases", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
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
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  knowledgeBaseId: uuid("knowledge_base_id").references(() => knowledgeBases.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  s3Key: text("s3_key").notNull(),
  s3Url: text("s3_url").notNull(),
  content: text("content"),
  metadata: jsonb("metadata"),
  status: text("status", { enum: ["pending", "processing", "indexed", "error"] })
    .notNull()
    .default("pending"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 768 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("embedding_index").using("hnsw", table.embedding.op("vector_cosine_ops"))],
);

export const files = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  s3Key: text("s3_key").notNull(),
  s3Url: text("s3_url").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const graphCheckpoints = pgTable(
  "graph_checkpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    graphId: text("graph_id").notNull(),
    threadId: text("thread_id").notNull(),
    nodeId: text("node_id").notNull(),
    phase: text("phase", { enum: ["pre", "post", "pause"] }).notNull(),
    state: jsonb("state").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("graph_checkpoints_graph_idx").on(table.graphId),
    index("graph_checkpoints_thread_idx").on(table.threadId),
    index("graph_checkpoints_thread_created_idx").on(table.threadId, table.createdAt),
  ],
);

export const graphThreadStates = pgTable(
  "graph_thread_states",
  {
    threadId: text("thread_id").primaryKey(),
    graphId: text("graph_id"),
    paused: boolean("paused").notNull().default(false),
    pauseReason: jsonb("pause_reason"),
    latestCheckpointId: uuid("latest_checkpoint_id").references(() => graphCheckpoints.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("graph_thread_states_graph_idx").on(table.graphId),
    index("graph_thread_states_paused_idx").on(table.paused),
  ],
);

export const deadLetterEntries = pgTable(
  "dead_letter_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    queueName: text("queue_name").notNull(),
    jobId: text("job_id").notNull(),
    graphId: text("graph_id"),
    threadId: text("thread_id"),
    failedNode: text("failed_node"),
    errorMessage: text("error_message").notNull(),
    finalState: jsonb("final_state"),
    checkpointId: uuid("checkpoint_id").references(() => graphCheckpoints.id, { onDelete: "set null" }),
    failureCategory: text("failure_category", { enum: ["llm_error", "tool_error", "timeout", "halt", "unknown"] })
      .notNull()
      .default("unknown"),
    retryCount: integer("retry_count").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("dead_letter_entries_queue_idx").on(table.queueName),
    index("dead_letter_entries_thread_idx").on(table.threadId),
    index("dead_letter_entries_category_idx").on(table.failureCategory),
  ],
);

export const settings = pgTable("settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const providerCredentials = pgTable(
  "provider_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    providerName: text("provider_name").notNull(),
    authType: text("auth_type", { enum: ["api_key", "oauth"] })
      .notNull()
      .default("api_key"),
    apiKey: text("api_key"),
    baseUrl: text("base_url"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    expiresAt: timestamp("expires_at", { mode: "date" }),
    scope: text("scope"),
    isEnabled: boolean("is_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("provider_user_idx").on(table.providerId, table.userId)],
);

export const mcpServers = pgTable("mcp_servers", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  transport: text("transport").notNull(),
  command: text("command"),
  args: jsonb("args").$type<string[]>().notNull().default([]),
  env: jsonb("env").$type<Record<string, string>>().notNull().default({}),
  url: text("url"),
  headers: jsonb("headers").$type<Record<string, string>>().notNull().default({}),
  enabled: boolean("enabled").notNull().default(true),
  governanceEnabled: boolean("governance_enabled").notNull().default(true),
  governancePolicy: jsonb("governance_policy").notNull().default({}),
  lastHealthStatus: text("last_health_status").notNull().default("unknown"),
  lastHealthCheckedAt: timestamp("last_health_checked_at", { mode: "date" }),
  lastToolCount: integer("last_tool_count"),
  lastError: text("last_error"),
  toolSchemaSnapshot: jsonb("tool_schema_snapshot").default([]),
  toolSchemaFingerprint: text("tool_schema_fingerprint"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const promptLibrary = pgTable("prompt_library", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
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
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  prompt: text("prompt").notNull(),
  cronExpression: text("cron_expression").notNull(),
  timezone: text("timezone").notNull().default("UTC"),
  maxExecutions: integer("max_executions"),
  executionCount: integer("execution_count").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  pausedAt: timestamp("paused_at", { mode: "date" }),
  pauseReason: text("pause_reason"),
  lastRunAt: timestamp("last_run_at", { mode: "date" }),
  webhookUrl: text("webhook_url"),
  notificationWebhookUrl: text("notification_webhook_url"),
  workflowDefinition: jsonb("workflow_definition").$type<AutomationWorkflowDefinition>().notNull().default({
    version: "1",
    entryNodeId: "trigger",
    nodes: [],
    edges: [],
  }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const automationRuns = pgTable("automation_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  automationId: uuid("automation_id")
    .notNull()
    .references(() => automations.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id").references(() => chatSessions.id, { onDelete: "set null" }),
  status: text("status", { enum: ["pending", "running", "success", "error"] })
    .notNull()
    .default("pending"),
  output: text("output"),
  error: text("error"),
  notificationStatus: text("notification_status", { enum: ["pending", "sent", "skipped", "error"] })
    .notNull()
    .default("skipped"),
  notificationError: text("notification_error"),
  startedAt: timestamp("started_at", { mode: "date" }),
  completedAt: timestamp("completed_at", { mode: "date" }),
});

export const agentTaskTemplates = pgTable("agent_task_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  title: text("title").notNull(),
  prompt: text("prompt").notNull(),
  variables: jsonb("variables").notNull().default([]),
  subtasks: jsonb("subtasks").notNull().default([]),
  defaultPriority: integer("default_priority").notNull().default(0),
  defaultMaxRetries: integer("default_max_retries").notNull().default(2),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});
export type AgentTaskTemplate = typeof agentTaskTemplates.$inferSelect;

export const agentTasks = pgTable("agent_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
  parentTaskId: uuid("parent_task_id").references((): AnyPgColumn => agentTasks.id, { onDelete: "cascade" }),
  templateId: uuid("template_id").references(() => agentTaskTemplates.id, { onDelete: "set null" }),
  assignedByUserId: uuid("assigned_by_user_id").references(() => users.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  prompt: text("prompt").notNull(),
  status: text("status", { enum: ["pending", "queued", "running", "success", "error", "cancelled"] })
    .notNull()
    .default("pending"),
  output: text("output"),
  error: text("error"),
  dependsOn: jsonb("depends_on").$type<string[]>().notNull().default([]),
  retryCount: integer("retry_count").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(2),
  priority: integer("priority").notNull().default(0), // -2..2; 2=high
  assignedAt: timestamp("assigned_at", { mode: "date" }).notNull().defaultNow(),
  reassignedAt: timestamp("reassigned_at", { mode: "date" }),
  metadata: jsonb("metadata").notNull().default({}),
  startedAt: timestamp("started_at", { mode: "date" }),
  completedAt: timestamp("completed_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});
export type AgentTask = typeof agentTasks.$inferSelect;

export const agentTaskComments = pgTable("agent_task_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => agentTasks.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
  authorType: text("author_type", { enum: ["human", "agent", "system"] })
    .notNull()
    .default("human"),
  body: text("body").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});
export type AgentTaskComment = typeof agentTaskComments.$inferSelect;

export const heterogeneousAgentProfiles = pgTable(
  "heterogeneous_agent_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    kind: text("kind", { enum: ["claude", "codex", "generic"] })
      .notNull()
      .default("generic"),
    command: text("command").notNull(),
    args: jsonb("args").notNull().default([]),
    workingDirectory: text("working_directory"),
    env: jsonb("env").notNull().default({}),
    isEnabled: boolean("is_enabled").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("heterogeneous_profiles_user_idx").on(table.userId)],
);

export const heterogeneousAgentRuns = pgTable(
  "heterogeneous_agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => heterogeneousAgentProfiles.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => chatSessions.id, { onDelete: "set null" }),
    status: text("status", { enum: ["queued", "running", "success", "error", "cancelled", "feature_disabled"] })
      .notNull()
      .default("queued"),
    input: text("input").notNull(),
    output: text("output"),
    error: text("error"),
    exitCode: integer("exit_code"),
    metadata: jsonb("metadata"),
    startedAt: timestamp("started_at", { mode: "date" }),
    completedAt: timestamp("completed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("heterogeneous_runs_profile_idx").on(table.profileId),
    index("heterogeneous_runs_user_idx").on(table.userId),
  ],
);

export const a2aCommunities = pgTable(
  "a2a_communities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    agentGroupId: uuid("agent_group_id").references(() => agentGroups.id, { onDelete: "set null" }),
    sharedMemoryKnowledgeBaseId: uuid("shared_memory_knowledge_base_id").references(() => knowledgeBases.id, {
      onDelete: "set null",
    }),
    sharedMemoryEnabled: boolean("shared_memory_enabled").notNull().default(true),
    accessControl: jsonb("access_control").notNull().default({ visibility: "private" }),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("a2a_communities_user_idx").on(table.userId),
    index("a2a_communities_workspace_idx").on(table.workspaceId),
    uniqueIndex("a2a_communities_user_name_idx").on(table.userId, table.name),
  ],
);

export const a2aPeers = pgTable(
  "a2a_peers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    communityId: uuid("community_id").references(() => a2aCommunities.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    endpoint: text("endpoint").notNull(),
    framework: text("framework", {
      enum: ["agenthub", "a2a", "langgraph", "crewai", "autogen", "openai-assistants", "custom"],
    })
      .notNull()
      .default("a2a"),
    agentCard: jsonb("agent_card").notNull().default({}),
    capabilities: jsonb("capabilities").notNull().default({}),
    authScheme: text("auth_scheme", { enum: ["none", "apiKey", "oauth2", "openIdConnect"] })
      .notNull()
      .default("none"),
    discoverySource: text("discovery_source", { enum: ["manual", "registry", "mdns", "local", "well-known"] })
      .notNull()
      .default("manual"),
    status: text("status", { enum: ["online", "offline", "unknown"] })
      .notNull()
      .default("unknown"),
    metadata: jsonb("metadata").notNull().default({}),
    lastSeenAt: timestamp("last_seen_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("a2a_peers_user_idx").on(table.userId),
    index("a2a_peers_community_idx").on(table.communityId),
    index("a2a_peers_status_idx").on(table.status),
    uniqueIndex("a2a_peers_user_endpoint_idx").on(table.userId, table.endpoint),
  ],
);

export const a2aCommunityMembers = pgTable(
  "a2a_community_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => a2aCommunities.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "cascade" }),
    peerId: uuid("peer_id").references(() => a2aPeers.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["coordinator", "worker", "observer"] })
      .notNull()
      .default("worker"),
    permissions: jsonb("permissions").notNull().default(["delegate"]),
    joinedAt: timestamp("joined_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("a2a_community_members_community_idx").on(table.communityId),
    index("a2a_community_members_user_idx").on(table.userId),
    index("a2a_community_members_agent_idx").on(table.agentId),
    index("a2a_community_members_peer_idx").on(table.peerId),
    uniqueIndex("a2a_community_members_community_agent_idx").on(table.communityId, table.agentId),
    uniqueIndex("a2a_community_members_community_peer_idx").on(table.communityId, table.peerId),
  ],
);

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  quota: one(userQuotas, { fields: [users.id], references: [userQuotas.userId] }),
  agents: many(agents),
  sessions: many(chatSessions),
  workspaceMemberships: many(workspaceMembers),
  workspaceInvitations: many(workspaceInvitations),
  knowledgeBases: many(knowledgeBases),
  documents: many(documents),
  files: many(files),
  resources: many(resources),
  pages: many(pages),
  dailyBriefs: many(dailyBriefs),
  agentSignalReviews: many(agentSignalReviews),
  projects: many(projects),
  installedSkills: many(installedSkills),
  heterogeneousProfiles: many(heterogeneousAgentProfiles),
  a2aCommunities: many(a2aCommunities),
  a2aPeers: many(a2aPeers),
}));

export const userQuotasRelations = relations(userQuotas, ({ one }) => ({
  user: one(users, { fields: [userQuotas.userId], references: [users.id] }),
}));

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  members: many(workspaceMembers),
  invitations: many(workspaceInvitations),
  agents: many(agents),
  sessions: many(chatSessions),
  projects: many(projects),
  knowledgeBases: many(knowledgeBases),
  files: many(files),
  a2aCommunities: many(a2aCommunities),
  a2aPeers: many(a2aPeers),
}));

export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
  workspace: one(workspaces, { fields: [workspaceMembers.workspaceId], references: [workspaces.id] }),
  user: one(users, { fields: [workspaceMembers.userId], references: [users.id] }),
  inviter: one(users, { fields: [workspaceMembers.invitedBy], references: [users.id] }),
}));

export const workspaceInvitationsRelations = relations(workspaceInvitations, ({ one }) => ({
  workspace: one(workspaces, { fields: [workspaceInvitations.workspaceId], references: [workspaces.id] }),
  inviter: one(users, { fields: [workspaceInvitations.invitedBy], references: [users.id] }),
}));

export const agentsRelations = relations(agents, ({ one, many }) => ({
  user: one(users, { fields: [agents.userId], references: [users.id] }),
  workspace: one(workspaces, { fields: [agents.workspaceId], references: [workspaces.id] }),
  knowledgeBase: one(knowledgeBases, { fields: [agents.knowledgeBaseId], references: [knowledgeBases.id] }),
  memories: many(memoryEntries),
  signalReviewItems: many(agentSignalReviewItems),
}));

export const chatSessionsRelations = relations(chatSessions, ({ one, many }) => ({
  user: one(users, { fields: [chatSessions.userId], references: [users.id] }),
  workspace: one(workspaces, { fields: [chatSessions.workspaceId], references: [workspaces.id] }),
  agent: one(agents, { fields: [chatSessions.agentId], references: [agents.id] }),
  group: one(agentGroups, { fields: [chatSessions.groupId], references: [agentGroups.id] }),
  messages: many(messages),
  resources: many(resources),
  pages: many(pages),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  session: one(chatSessions, { fields: [messages.sessionId], references: [chatSessions.id] }),
  resources: many(resources),
  pages: many(pages),
}));

export const resourcesRelations = relations(resources, ({ one }) => ({
  user: one(users, { fields: [resources.userId], references: [users.id] }),
  session: one(chatSessions, { fields: [resources.sessionId], references: [chatSessions.id] }),
  sourceMessage: one(messages, { fields: [resources.sourceMessageId], references: [messages.id] }),
}));

export const dailyBriefsRelations = relations(dailyBriefs, ({ one }) => ({
  user: one(users, { fields: [dailyBriefs.userId], references: [users.id] }),
}));

export const agentSignalReviewsRelations = relations(agentSignalReviews, ({ one, many }) => ({
  user: one(users, { fields: [agentSignalReviews.userId], references: [users.id] }),
  items: many(agentSignalReviewItems),
}));

export const agentSignalReviewItemsRelations = relations(agentSignalReviewItems, ({ one }) => ({
  review: one(agentSignalReviews, { fields: [agentSignalReviewItems.reviewId], references: [agentSignalReviews.id] }),
  user: one(users, { fields: [agentSignalReviewItems.userId], references: [users.id] }),
  agent: one(agents, { fields: [agentSignalReviewItems.agentId], references: [agents.id] }),
  task: one(agentTasks, { fields: [agentSignalReviewItems.taskId], references: [agentTasks.id] }),
  skill: one(installedSkills, { fields: [agentSignalReviewItems.skillId], references: [installedSkills.id] }),
}));

export const pagesRelations = relations(pages, ({ one, many }) => ({
  user: one(users, { fields: [pages.userId], references: [users.id] }),
  agent: one(agents, { fields: [pages.agentId], references: [agents.id] }),
  sourceSession: one(chatSessions, { fields: [pages.sourceSessionId], references: [chatSessions.id] }),
  sourceMessage: one(messages, { fields: [pages.sourceMessageId], references: [messages.id] }),
  comments: many(pageComments),
  agentEdits: many(pageAgentEdits),
  versions: many(pageVersions),
}));

export const pageCommentsRelations = relations(pageComments, ({ one }) => ({
  page: one(pages, { fields: [pageComments.pageId], references: [pages.id] }),
  user: one(users, { fields: [pageComments.userId], references: [users.id] }),
  agent: one(agents, { fields: [pageComments.agentId], references: [agents.id] }),
}));

export const pageAgentEditsRelations = relations(pageAgentEdits, ({ one }) => ({
  page: one(pages, { fields: [pageAgentEdits.pageId], references: [pages.id] }),
  user: one(users, { fields: [pageAgentEdits.userId], references: [users.id] }),
  agent: one(agents, { fields: [pageAgentEdits.agentId], references: [agents.id] }),
  sourceMessage: one(messages, { fields: [pageAgentEdits.sourceMessageId], references: [messages.id] }),
}));

export const pageVersionsRelations = relations(pageVersions, ({ one }) => ({
  page: one(pages, { fields: [pageVersions.pageId], references: [pages.id] }),
  user: one(users, { fields: [pageVersions.userId], references: [users.id] }),
  agent: one(agents, { fields: [pageVersions.agentId], references: [agents.id] }),
  sourceMessage: one(messages, { fields: [pageVersions.sourceMessageId], references: [messages.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, { fields: [projects.userId], references: [users.id] }),
  agents: many(projectAgents),
  chats: many(projectChats),
  pages: many(projectPages),
  knowledgeBases: many(projectKnowledgeBases),
  tasks: many(projectTasks),
  resources: many(projectResources),
  automations: many(projectAutomations),
  notebookDocuments: many(projectNotebookDocuments),
}));

export const projectNotebookDocumentsRelations = relations(projectNotebookDocuments, ({ one }) => ({
  project: one(projects, { fields: [projectNotebookDocuments.projectId], references: [projects.id] }),
  user: one(users, { fields: [projectNotebookDocuments.userId], references: [users.id] }),
}));

export const installedSkillsRelations = relations(installedSkills, ({ one, many }) => ({
  user: one(users, { fields: [installedSkills.userId], references: [users.id] }),
  resources: many(skillResources),
  signalReviewItems: many(agentSignalReviewItems),
}));

export const skillResourcesRelations = relations(skillResources, ({ one }) => ({
  user: one(users, { fields: [skillResources.userId], references: [users.id] }),
  skill: one(installedSkills, { fields: [skillResources.skillId], references: [installedSkills.id] }),
}));

export const heterogeneousAgentProfilesRelations = relations(heterogeneousAgentProfiles, ({ one, many }) => ({
  user: one(users, { fields: [heterogeneousAgentProfiles.userId], references: [users.id] }),
  runs: many(heterogeneousAgentRuns),
}));

export const heterogeneousAgentRunsRelations = relations(heterogeneousAgentRuns, ({ one }) => ({
  user: one(users, { fields: [heterogeneousAgentRuns.userId], references: [users.id] }),
  profile: one(heterogeneousAgentProfiles, {
    fields: [heterogeneousAgentRuns.profileId],
    references: [heterogeneousAgentProfiles.id],
  }),
  session: one(chatSessions, { fields: [heterogeneousAgentRuns.sessionId], references: [chatSessions.id] }),
}));

export const a2aCommunitiesRelations = relations(a2aCommunities, ({ one, many }) => ({
  user: one(users, { fields: [a2aCommunities.userId], references: [users.id] }),
  workspace: one(workspaces, { fields: [a2aCommunities.workspaceId], references: [workspaces.id] }),
  agentGroup: one(agentGroups, { fields: [a2aCommunities.agentGroupId], references: [agentGroups.id] }),
  sharedMemoryKnowledgeBase: one(knowledgeBases, {
    fields: [a2aCommunities.sharedMemoryKnowledgeBaseId],
    references: [knowledgeBases.id],
  }),
  peers: many(a2aPeers),
  members: many(a2aCommunityMembers),
}));

export const a2aPeersRelations = relations(a2aPeers, ({ one, many }) => ({
  user: one(users, { fields: [a2aPeers.userId], references: [users.id] }),
  workspace: one(workspaces, { fields: [a2aPeers.workspaceId], references: [workspaces.id] }),
  community: one(a2aCommunities, { fields: [a2aPeers.communityId], references: [a2aCommunities.id] }),
  memberships: many(a2aCommunityMembers),
}));

export const a2aCommunityMembersRelations = relations(a2aCommunityMembers, ({ one }) => ({
  community: one(a2aCommunities, { fields: [a2aCommunityMembers.communityId], references: [a2aCommunities.id] }),
  user: one(users, { fields: [a2aCommunityMembers.userId], references: [users.id] }),
  agent: one(agents, { fields: [a2aCommunityMembers.agentId], references: [agents.id] }),
  peer: one(a2aPeers, { fields: [a2aCommunityMembers.peerId], references: [a2aPeers.id] }),
}));

export const knowledgeBasesRelations = relations(knowledgeBases, ({ one, many }) => ({
  user: one(users, { fields: [knowledgeBases.userId], references: [users.id] }),
  documents: many(documents),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  knowledgeBase: one(knowledgeBases, { fields: [documents.knowledgeBaseId], references: [knowledgeBases.id] }),
  chunks: many(documentChunks),
}));

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  keyPrefix: varchar("key_prefix", { length: 12 }).notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  lastUsedAt: timestamp("last_used_at", { mode: "date" }),
  expiresAt: timestamp("expires_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const channelAccounts = pgTable(
  "channel_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["discord", "slack"] }).notNull(),
    name: text("name").notNull(),
    externalTeamId: text("external_team_id"),
    externalChannelId: text("external_channel_id"),
    verificationSecretEncrypted: text("verification_secret_encrypted").notNull(),
    verificationSecretIv: text("verification_secret_iv").notNull(),
    verificationSecretAuthTag: text("verification_secret_auth_tag").notNull(),
    verificationSecretHint: varchar("verification_secret_hint", { length: 8 }),
    isEnabled: boolean("is_enabled").notNull().default(true),
    allowedTools: jsonb("allowed_tools").notNull().default([]),
    dmPolicy: text("dm_policy", { enum: ["disabled", "paired-only", "open"] })
      .notNull()
      .default("paired-only"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("channel_accounts_user_provider_idx").on(table.userId, table.provider),
    index("channel_accounts_agent_idx").on(table.agentId),
    index("channel_accounts_external_idx").on(table.provider, table.externalTeamId, table.externalChannelId),
  ],
);

export const channelSenderPolicies = pgTable(
  "channel_sender_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelAccountId: uuid("channel_account_id")
      .notNull()
      .references(() => channelAccounts.id, { onDelete: "cascade" }),
    externalSenderId: text("external_sender_id").notNull(),
    displayName: text("display_name"),
    isPaired: boolean("is_paired").notNull().default(false),
    allowedTools: jsonb("allowed_tools").notNull().default([]),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("channel_sender_policy_channel_sender_idx").on(table.channelAccountId, table.externalSenderId),
    index("channel_sender_policy_channel_idx").on(table.channelAccountId),
  ],
);

export const channelAuditLog = pgTable(
  "channel_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelAccountId: uuid("channel_account_id").references(() => channelAccounts.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    provider: text("provider", { enum: ["discord", "slack"] }).notNull(),
    externalSenderId: text("external_sender_id"),
    externalChannelId: text("external_channel_id"),
    eventType: text("event_type").notNull(),
    outcome: text("outcome", { enum: ["success", "denied", "error"] }).notNull(),
    reason: text("reason"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("channel_audit_account_created_idx").on(table.channelAccountId, table.createdAt),
    index("channel_audit_user_created_idx").on(table.userId, table.createdAt),
    index("channel_audit_agent_created_idx").on(table.agentId, table.createdAt),
  ],
);

export type User = typeof users.$inferSelect;
export type UserQuotaRow = typeof userQuotas.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type AgentGroup = typeof agentGroups.$inferSelect;
export type ChatSession = typeof chatSessions.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Page = typeof pages.$inferSelect;
export type PageComment = typeof pageComments.$inferSelect;
export type PageAgentEdit = typeof pageAgentEdits.$inferSelect;
export type PageVersion = typeof pageVersions.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ProjectNotebookDocument = typeof projectNotebookDocuments.$inferSelect;
export type MemoryEntry = typeof memoryEntries.$inferSelect;
export type KnowledgeBase = typeof knowledgeBases.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type DocumentChunk = typeof documentChunks.$inferSelect;
export type File = typeof files.$inferSelect;
export type Resource = typeof resources.$inferSelect;
export type DailyBrief = typeof dailyBriefs.$inferSelect;
export type AgentSignalReview = typeof agentSignalReviews.$inferSelect;
export type AgentSignalReviewItem = typeof agentSignalReviewItems.$inferSelect;
export type InstalledSkill = typeof installedSkills.$inferSelect;
export type SkillResource = typeof skillResources.$inferSelect;
export type McpServer = typeof mcpServers.$inferSelect;
export type Automation = typeof automations.$inferSelect;
export type AutomationRun = typeof automationRuns.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type ChannelAccount = typeof channelAccounts.$inferSelect;
export type ChannelSenderPolicy = typeof channelSenderPolicies.$inferSelect;
export type ChannelAuditLog = typeof channelAuditLog.$inferSelect;
export type HeterogeneousAgentProfileRow = typeof heterogeneousAgentProfiles.$inferSelect;
export type HeterogeneousAgentRun = typeof heterogeneousAgentRuns.$inferSelect;
export type A2ACommunity = typeof a2aCommunities.$inferSelect;
export type A2APeer = typeof a2aPeers.$inferSelect;
export type A2ACommunityMember = typeof a2aCommunityMembers.$inferSelect;

// ── Trust Engine ──────────────────────────────────────────────────────────────

export const agentCredentials = pgTable("agent_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tool: text("tool").notNull(),
  encryptedValue: text("encrypted_value").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  keyHint: varchar("key_hint", { length: 8 }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const trustPolicies = pgTable("trust_policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "cascade" }),
  allowedTools: jsonb("allowed_tools").default([]),
  maxTokensPerDay: integer("max_tokens_per_day"),
  maxRequestsPerMinute: integer("max_requests_per_minute"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const credentialAuditLog = pgTable("credential_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
  credentialId: uuid("credential_id").references(() => agentCredentials.id, { onDelete: "set null" }),
  tool: text("tool").notNull(),
  keyHint: varchar("key_hint", { length: 8 }),
  outcome: text("outcome", { enum: ["success", "denied", "error"] }).notNull(),
  detail: text("detail"),
  previousHash: text("previous_hash")
    .notNull()
    .default("0000000000000000000000000000000000000000000000000000000000000000"),
  entryHash: text("entry_hash").notNull().default("0000000000000000000000000000000000000000000000000000000000000000"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export type AgentCredential = typeof agentCredentials.$inferSelect;
export type TrustPolicy = typeof trustPolicies.$inferSelect;
export type CredentialAuditLog = typeof credentialAuditLog.$inferSelect;
