#!/usr/bin/env tsx
/**
 * E2E Test Seed Script
 * Creates a standard test user, agents, and knowledge bases for E2E tests.
 * Run before Playwright tests: pnpm tsx tests/e2e/seed.ts
 */
import { client, db } from "../../src/server/db";
import { agents, agentGroups, groupMembers, knowledgeBases, users } from "../../src/server/db/schema";

async function seed() {
  console.log("Seeding E2E test data...");

  // Create test user (if not exists)
  const [user] = await db
    .insert(users)
    .values({
      id: "00000000-0000-0000-0000-000000000001",
      name: "E2E Test User",
      email: "e2e@agenthub.test",
      emailVerified: new Date(),
      role: "user",
    })
    .onConflictDoNothing({ target: users.email })
    .returning();

  const userId = user?.id || "00000000-0000-0000-0000-000000000001";

  // Create test agents
  const testAgents = await db
    .insert(agents)
    .values([
      {
        userId,
        name: "E2E Calculator",
        systemPrompt: "You are a calculator assistant. Use the calculator tool for math.",
        model: "ollama:qwen2.5:7b",
        tools: '["calculator"]',
      },
      {
        userId,
        name: "E2E Coder",
        systemPrompt: "You are a coding assistant. Write clean, commented code.",
        model: "ollama:qwen2.5-coder:14b",
        tools: '["read_file"]',
      },
    ])
    .onConflictDoNothing()
    .returning();

  // Create test knowledge base
  await db
    .insert(knowledgeBases)
    .values({
      userId,
      name: "E2E Test KB",
      description: "Knowledge base for E2E tests",
      embeddingModel: "nomic-embed-text",
    })
    .onConflictDoNothing();

  console.log(`Seeded user: ${userId}`);
  console.log(`Seeded ${testAgents.length} agents`);
  console.log("Done.");
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end({ timeout: 1 });
  });
