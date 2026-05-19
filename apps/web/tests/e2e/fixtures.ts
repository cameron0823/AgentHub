import { createHash } from "node:crypto";
import type { Page } from "@playwright/test";
import postgres from "postgres";

const DEFAULT_DATABASE_URL = "postgres://agenthub:agenthub_password@localhost:5432/agenthub_e2e";
const DEFAULT_CASDOOR_DATABASE_URL = "postgres://agenthub:agenthub_password@localhost:5432/casdoor";
const E2E_EMAIL = "admin@localhost";

const databaseUrl = process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
const casdoorDatabaseUrl = process.env.CASDOOR_DATABASE_URL || DEFAULT_CASDOOR_DATABASE_URL;
const connectTimeoutSeconds = Number(process.env.E2E_DB_CONNECT_TIMEOUT_SECONDS ?? 5);
const sql = postgres(databaseUrl, { max: 3, connect_timeout: connectTimeoutSeconds, idle_timeout: 5 });

function redactDatabaseUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "REDACTED";
    return parsed.toString();
  } catch {
    return "<invalid DATABASE_URL>";
  }
}

export async function assertE2EDatabaseReady() {
  const probe = postgres(databaseUrl, { max: 1, connect_timeout: connectTimeoutSeconds, idle_timeout: 1 });
  try {
    await probe`select 1`;
  } catch (error) {
    const redactedUrl = redactDatabaseUrl(databaseUrl);
    throw new Error(
      [
        `E2E database is not reachable at ${redactedUrl}.`,
        "Start the data plane with `docker compose up -d postgresql redis minio casdoor searxng`,",
        "ensure `agenthub_e2e` exists with pgvector enabled, then run `DATABASE_URL=postgres://agenthub:agenthub_password@localhost:5432/agenthub_e2e pnpm db:migrate`.",
      ].join(" "),
      { cause: error },
    );
  } finally {
    await probe.end({ timeout: 1 }).catch(() => undefined);
  }
}

export async function closeE2EDatabase() {
  await sql.end({ timeout: 1 });
}

export function uniqueName(prefix: string) {
  return `${prefix} ${Date.now()} ${Math.random().toString(36).slice(2, 7)}`;
}

export async function signInWithDevCredentials(page: Page, callbackUrl = "/") {
  await page.goto(`/api/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  await page.fill('input[name="email"]', E2E_EMAIL);
  await page.fill('input[name="password"]', "admin12345");
  await page.getByRole("button", { name: /sign in with dev login/i }).click();
  await page.waitForURL(callbackUrl);
}

export async function ensureE2EAuthenticated(page: Page) {
  await page.goto("/");
  const newChat = page.getByRole("button", { name: /^new chat$/i });
  if (await newChat.isVisible({ timeout: 7_500 }).catch(() => false)) return;
  await signInWithDevCredentials(page);
}

export async function resetE2EData() {
  const userId = await getE2EUserId();
  await sql`delete from api_keys where user_id = ${userId}`;
  await sql`delete from pages where user_id = ${userId}`;
  await sql`delete from projects where user_id = ${userId}`;
  await sql`delete from chat_sessions where user_id = ${userId}`;
  await sql`delete from mcp_servers where user_id = ${userId}`;
  await sql`delete from files where user_id = ${userId}`;
  await sql`delete from memory_entries where user_id = ${userId}`;
  await sql`delete from documents where user_id = ${userId}`;
  await sql`delete from knowledge_bases where user_id = ${userId}`;
  await sql`delete from installed_skills where user_id = ${userId}`;
  await sql`delete from agent_groups where user_id = ${userId}`;
  await sql`delete from agents where user_id = ${userId}`;
}

export async function getE2EUserId() {
  const existing = await sql<{ id: string }[]>`
    select id from users where email = ${E2E_EMAIL} limit 1
  `;
  if (existing[0]) return existing[0].id;

  const created = await sql<{ id: string }[]>`
    insert into users (email, name, role)
    values (${E2E_EMAIL}, 'admin', 'admin')
    returning id
  `;
  return created[0].id;
}

function hashApiKey(rawKey: string) {
  return createHash("sha256").update(rawKey).digest("hex");
}

export async function createE2EApiKey(name = uniqueName("E2E Public API Key")) {
  const userId = await getE2EUserId();
  const rawKey = `ah_e2e_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  const [created] = await sql<{ id: string; keyPrefix: string }[]>`
    insert into api_keys (user_id, name, key_hash, key_prefix)
    values (${userId}, ${name}, ${hashApiKey(rawKey)}, ${rawKey.slice(0, 12)})
    returning id, key_prefix as "keyPrefix"
  `;
  return { ...created, key: rawKey };
}

export async function createE2EAgent(name = uniqueName("E2E Agent")) {
  const userId = await getE2EUserId();
  const created = await sql<{ id: string; name: string }[]>`
    insert into agents (user_id, name, description, system_prompt, model, tools)
    values (${userId}, ${name}, 'Created by Playwright E2E fixture', 'You are an E2E fixture agent.', 'ollama:qwen2.5:7b', '[]')
    returning id, name
  `;
  return created[0];
}

export async function createE2ESessionWithMessages(title = uniqueName("E2E Branch Session")) {
  const userId = await getE2EUserId();
  const sessions = await sql<{ id: string; title: string }[]>`
    insert into chat_sessions (user_id, title, model)
    values (${userId}, ${title}, 'ollama:qwen2.5:7b')
    returning id, title
  `;
  const session = sessions[0];

  const firstUsers = await sql<{ id: string; content: string }[]>`
    insert into messages (session_id, role, content)
    values (${session.id}, 'user', ${`${title} user prompt`})
    returning id, content
  `;
  const firstUser = firstUsers[0];

  const assistants = await sql<{ id: string; content: string }[]>`
    insert into messages (session_id, role, content, parent_id, model)
    values (${session.id}, 'assistant', ${`${title} assistant response`}, ${firstUser.id}, 'ollama:qwen2.5:7b')
    returning id, content
  `;
  const assistant = assistants[0];

  await sql`
    insert into messages (session_id, role, content, parent_id)
    values (${session.id}, 'user', ${`${title} future message that should not be copied`}, ${assistant.id})
  `;

  return { session, firstUser, assistant };
}

export async function createE2ESessionWithAssistantMetadata(
  title = uniqueName("E2E Metadata Session"),
  assistantMetadata: postgres.JSONValue = {},
  assistantContent = `${title} assistant response`,
) {
  const userId = await getE2EUserId();
  const sessions = await sql<{ id: string; title: string }[]>`
    insert into chat_sessions (user_id, title, model)
    values (${userId}, ${title}, 'ollama:qwen2.5:7b')
    returning id, title
  `;
  const session = sessions[0];

  const firstUsers = await sql<{ id: string; content: string }[]>`
    insert into messages (session_id, role, content)
    values (${session.id}, 'user', ${`${title} user prompt`})
    returning id, content
  `;
  const firstUser = firstUsers[0];

  const assistants = await sql<{ id: string; content: string }[]>`
    insert into messages (session_id, role, content, parent_id, model, metadata)
    values (
      ${session.id},
      'assistant',
      ${assistantContent},
      ${firstUser.id},
      'ollama:qwen2.5:7b',
      ${sql.json(assistantMetadata)}
    )
    returning id, content
  `;

  return { session, firstUser, assistant: assistants[0] };
}

export async function createE2EKnowledgeBase(name = uniqueName("E2E KB")) {
  const userId = await getE2EUserId();
  const created = await sql<{ id: string; name: string }[]>`
    insert into knowledge_bases (user_id, name, description)
    values (${userId}, ${name}, 'Created by Playwright E2E fixture')
    returning id, name
  `;
  return created[0];
}

export async function createE2EDocument(knowledgeBaseId: string, name = `${uniqueName("E2E Doc")}.txt`) {
  const userId = await getE2EUserId();
  const created = await sql<{ id: string; name: string }[]>`
    insert into documents (user_id, knowledge_base_id, name, mime_type, size, s3_key, s3_url, content, status)
    values (
      ${userId},
      ${knowledgeBaseId},
      ${name},
      'text/plain',
      42,
      ${`e2e/${name}`},
      ${`http://localhost:9000/e2e/${name}`},
      'AgentHub E2E knowledge base fixture content.',
      'indexed'
    )
    returning id, name
  `;
  return created[0];
}

export async function createE2EMemory(
  value: string,
  status: "accepted" | "proposed" = "accepted",
  options: {
    agentId?: string | null;
    category?: string;
    key?: string;
    confidence?: number;
  } = {},
) {
  const userId = await getE2EUserId();
  const created = await sql<{ id: string; value: string; status: string }[]>`
    insert into memory_entries (user_id, agent_id, category, key, value, confidence, status)
    values (
      ${userId},
      ${options.agentId ?? null},
      ${options.category ?? "profile"},
      ${options.key ?? uniqueName("e2e-memory")},
      ${value},
      ${options.confidence ?? 0.92},
      ${status}
    )
    returning id, value, status
  `;
  return created[0];
}

export async function createE2EPageWithHistory(title = uniqueName("E2E Page History")) {
  const userId = await getE2EUserId();
  const originalTitle = `${title} Original`;
  const revisedTitle = `${title} Revised`;
  const currentTitle = `${title} Current`;
  const originalMarkdown = `# ${originalTitle}\n\nE2E original page history body.`;
  const revisedMarkdown = `# ${revisedTitle}\n\nE2E revised page history body.`;
  const currentMarkdown = `# ${currentTitle}\n\nE2E current page history body with final details.`;
  const [page] = await sql<{ id: string; title: string }[]>`
    insert into pages (user_id, title, markdown, plain_text, last_edited_by, current_version)
    values (${userId}, ${currentTitle}, ${currentMarkdown}, 'E2E current page history body with final details.', 'agent', 3)
    returning id, title
  `;

  await sql`
    insert into page_versions (page_id, user_id, version_number, title, markdown, plain_text, source_type)
    values
      (${page.id}, ${userId}, 1, ${originalTitle}, ${originalMarkdown}, 'E2E original page history body.', 'human'),
      (${page.id}, ${userId}, 2, ${revisedTitle}, ${revisedMarkdown}, 'E2E revised page history body.', 'human'),
      (${page.id}, ${userId}, 3, ${currentTitle}, ${currentMarkdown}, 'E2E current page history body with final details.', 'agent')
  `;

  return {
    id: page.id,
    originalTitle,
    revisedTitle,
    currentTitle,
    originalMarkdown,
    revisedMarkdown,
    currentMarkdown,
  };
}

export async function createE2EMcpServer(name = uniqueName("E2E MCP Server")) {
  const userId = await getE2EUserId();
  const created = await sql<{ id: string; name: string }[]>`
    insert into mcp_servers (user_id, name, transport, command, args, enabled)
    values (${userId}, ${name}, 'stdio', 'node', '["--version"]', true)
    returning id, name
  `;
  return created[0];
}

export async function createE2EHttpMcpServer(input: {
  name?: string;
  url: string;
  governancePolicy?: postgres.JSONValue;
}) {
  const userId = await getE2EUserId();
  const created = await sql<{ id: string; name: string }[]>`
    insert into mcp_servers (
      user_id,
      name,
      transport,
      url,
      enabled,
      governance_enabled,
      governance_policy
    )
    values (
      ${userId},
      ${input.name ?? uniqueName("E2E HTTP MCP")},
      'http',
      ${input.url},
      true,
      true,
      ${sql.json(input.governancePolicy ?? {})}
    )
    returning id, name
  `;
  return created[0];
}

export async function ensureE2ECasdoorOAuthApp(input: {
  clientId: string;
  clientSecret: string;
  redirectUris: string[];
}) {
  const redirectUris = [...new Set(input.redirectUris)];
  const casdoorSql = postgres(casdoorDatabaseUrl, {
    max: 1,
    connect_timeout: connectTimeoutSeconds,
    idle_timeout: 5,
  });
  try {
    const [updated] = await casdoorSql<Array<{ name: string; clientId: string; redirectUris: string }>>`
      update application
      set
        client_id = ${input.clientId},
        client_secret = ${input.clientSecret},
        redirect_uris = ${JSON.stringify(redirectUris)},
        enable_password = true,
        organization = 'built-in'
      where owner = 'admin' and name = 'app-built-in'
      returning name, client_id as "clientId", redirect_uris as "redirectUris"
    `;
    if (!updated) {
      throw new Error("Casdoor app-built-in application was not found");
    }
    return updated;
  } finally {
    await casdoorSql.end({ timeout: 1 }).catch(() => undefined);
  }
}
