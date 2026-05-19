import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readText(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("automation schema persists a visual workflow definition", async () => {
  const [schema, migration, journal] = await Promise.all([
    readText("apps/web/src/server/db/schema.ts"),
    readText("apps/web/drizzle/0030_visual_workflow_designer.sql"),
    readText("apps/web/drizzle/meta/_journal.json"),
  ]);

  assert.match(schema, /workflowDefinition: jsonb\("workflow_definition"\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS workflow_definition jsonb/);
  assert.match(journal, /0030_visual_workflow_designer/);
});

test("automation router validates and stores user-scoped workflow updates", async () => {
  const router = await readText("apps/web/src/server/routers/automations.ts");

  assert.match(router, /WORKFLOW_NODE_TYPES/, "router must use the shared workflow node type list");
  assert.match(router, /workflowDefinitionSchema/, "router must validate workflow definitions");
  assert.match(router, /updateWorkflow: authedProcedure/, "router must expose a workflow update mutation");
  assert.match(router, /normalizeAutomationWorkflow/, "router must normalize workflow payloads before persistence");
  assert.match(
    router,
    /and\(eq\(automations\.id, input\.id\), eq\(automations\.userId, ctx\.user\.id\)\)/,
    "workflow updates must be scoped to the authenticated user",
  );
  assert.match(router, /workflowDefinition: automations\.workflowDefinition/, "list must return workflow definitions");
});

test("visual designer renders a node canvas, node palette, properties, and save mutation", async () => {
  const [designer, automations] = await Promise.all([
    readText("apps/web/src/components/WorkflowDesigner.tsx"),
    readText("apps/web/src/components/AutomationsManager.tsx"),
  ]);

  assert.match(designer, /data-testid="workflow-designer"/);
  assert.match(designer, /data-testid="workflow-designer-canvas"/);
  assert.match(designer, /data-testid="workflow-node"/);
  assert.match(designer, /WORKFLOW_NODE_TYPES\.map/, "designer must expose a composable node palette");
  assert.match(designer, /trpc\.automations\.updateWorkflow\.useMutation/, "designer must persist through tRPC");
  assert.match(designer, /Add edge/, "designer must support connecting nodes");
  assert.match(designer, /Pause before this node/, "designer must expose human-gate interruption");
  assert.match(automations, /<WorkflowDesigner automation=\{auto\}/, "automations UI must mount the designer");
});

test("automation worker injects saved workflow plans into real runs", async () => {
  const [worker, helper, graph] = await Promise.all([
    readText("apps/web/src/server/workers/automationWorker.ts"),
    readText("apps/web/src/lib/workflow-designer.ts"),
    readText("apps/web/src/server/graph/index.ts"),
  ]);

  assert.match(helper, /createDefaultAutomationWorkflow/);
  assert.match(helper, /workflowToSerializableGraph/);
  assert.match(helper, /buildAutomationWorkflowPrompt/);
  assert.match(worker, /buildAutomationWorkflowPrompt\(auto\.prompt, auto\.workflowDefinition\)/);
  assert.match(worker, /content: runPrompt/);
  assert.match(worker, /messages: \[\{ role: "user", content: runPrompt \}\]/);
  assert.match(graph, /"trigger"/);
  assert.match(graph, /"output"/);
});
