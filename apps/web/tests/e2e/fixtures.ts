import postgres from "postgres";

const DEFAULT_DATABASE_URL = "postgres://agenthub:agenthub_password@localhost:5432/agenthub_e2e";
const E2E_EMAIL = "admin@localhost";

const sql = postgres(process.env.DATABASE_URL || DEFAULT_DATABASE_URL, { max: 3 });

export function uniqueName(prefix: string) {
  return `${prefix} ${Date.now()} ${Math.random().toString(36).slice(2, 7)}`;
}

export async function resetE2EData() {
  await sql`delete from mcp_servers where name like 'E2E %'`;
  await sql`delete from memory_entries where value like 'E2E %' or key like 'e2e-memory %'`;
  await sql`delete from documents where name like 'E2E %' or s3_key like 'e2e/%'`;
  await sql`delete from knowledge_bases where name like 'E2E %'`;
  await sql`delete from chat_sessions where title like 'E2E %'`;
  await sql`delete from agent_groups where name like 'E2E %'`;
  await sql`delete from agents where name like 'E2E %'`;
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

export async function createE2EMemory(value: string, status: "accepted" | "proposed" = "accepted") {
  const userId = await getE2EUserId();
  const created = await sql<{ id: string; value: string; status: string }[]>`
    insert into memory_entries (user_id, category, key, value, confidence, status)
    values (${userId}, 'profile', ${uniqueName("e2e-memory")}, ${value}, 0.92, ${status})
    returning id, value, status
  `;
  return created[0];
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
