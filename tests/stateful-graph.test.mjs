import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

async function readText(rel) {
  return readFile(join(root, rel), "utf8");
}

describe("Stateful graph orchestration", () => {
  it("defines a LangGraph-style graph DSL with checkpoints and node types", async () => {
    const graph = await readText("apps/web/src/server/graph/index.ts");

    for (const nodeType of ["agent", "tool", "condition", "human_gate", "parallel", "map"]) {
      assert.match(graph, new RegExp(`"${nodeType}"`), `missing ${nodeType} node type`);
    }
    assert.match(graph, /export interface GraphDefinition/);
    assert.match(graph, /stateSchema: z\.ZodType/);
    assert.match(graph, /entryNodeId/);
    assert.match(graph, /checkpoint/);
    assert.match(graph, /limits/);
  });

  it("implements pause/resume checkpoint management and termination dead-lettering", async () => {
    const [graph, schema, migration] = await Promise.all([
      readText("apps/web/src/server/graph/index.ts"),
      readText("apps/web/src/server/db/schema.ts"),
      readText("apps/web/drizzle/0026_durable_orchestration_state.sql"),
    ]);

    assert.match(graph, /export class CheckpointManager/);
    assert.match(graph, /saveCheckpoint/);
    assert.match(graph, /db\s*\.\s*insert\(\s*graphCheckpoints\s*\)/);
    assert.match(graph, /db\s*\.\s*insert\(\s*graphThreadStates\s*\)/);
    assert.match(graph, /onConflictDoUpdate/);
    assert.match(graph, /orderBy\(desc\(graphCheckpoints\.createdAt\)\)/);
    assert.match(graph, /pause\(threadId/);
    assert.match(graph, /resume\(threadId/);
    assert.match(graph, /async resume\(\s*definition: GraphDefinition/);
    assert.match(graph, /runFrom\(definition/);
    assert.match(graph, /resumeInput/);
    assert.match(graph, /export class GraphResumeRegistry/);
    assert.match(graph, /resumeThread\(threadId/);
    assert.match(graph, /export class GraphExecutor/);
    assert.match(graph, /Graph iteration limit reached/);
    assert.match(graph, /Graph execution timed out/);
    assert.match(graph, /deadLetterQueue\.record/);
    assert.match(graph, /failureCategory/);
    assert.match(schema, /export const graphCheckpoints = pgTable\(\s*\"graph_checkpoints\"/);
    assert.match(schema, /export const graphThreadStates = pgTable\(\s*\"graph_thread_states\"/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS "graph_checkpoints"/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS "graph_thread_states"/);
  });

  it("supports human-gate interruption before continuing graph execution", async () => {
    const graph = await readText("apps/web/src/server/graph/index.ts");

    assert.match(graph, /node\.type === "human_gate" && node\.interrupt/);
    assert.match(graph, /status: "paused"/);
    assert.match(graph, /phase: "pause"/);
    assert.match(graph, /nextNodeId/);
    assert.match(graph, /conditions\[edge\.condition\]/);
  });

  it("exposes paused graph threads to an admin UI with resume controls", async () => {
    const [adminRouter, adminPanel] = await Promise.all([
      readText("apps/web/src/server/routers/admin.ts"),
      readText("apps/web/src/components/AdminPanel.tsx"),
    ]);

    assert.match(adminRouter, /graphThreads: adminProcedure\.query/);
    assert.match(adminRouter, /graphThreadStates/);
    assert.match(adminRouter, /eq\(graphThreadStates\.paused, true\)/);
    assert.match(adminRouter, /resumeGraphThread: adminProcedure/);
    assert.match(adminRouter, /graphResumeRegistry\.resumeThread/);
    assert.match(adminRouter, /replayed: true/);
    assert.match(adminRouter, /replayed: false/);
    assert.match(adminRouter, /paused: false/);
    assert.match(adminPanel, /Paused graph threads/);
    assert.match(adminPanel, /trpc\.admin\.stats\.graphThreads\.useQuery/);
    assert.match(adminPanel, /resumeGraphThread\.mutate/);
    assert.match(adminPanel, /Resume/);
  });
});
