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

describe("A2UI standard", () => {
  it("defines a versioned A2UI schema with exactly-one-action validation and component catalog", async () => {
    const schema = await readText("apps/web/src/lib/a2ui/schema.ts");

    assert.match(schema, /A2UI_VERSION = "0\.9"/);
    for (const type of [
      "Card",
      "Column",
      "Row",
      "TextField",
      "CheckBox",
      "ChoicePicker",
      "Button",
      "Table",
      "Chart",
      "Wizard",
    ]) {
      assert.match(schema, new RegExp(`"${type}"`), `schema must include ${type}`);
    }
    assert.match(schema, /createSurface/);
    assert.match(schema, /updateComponents/);
    assert.match(schema, /updateDataModel/);
    assert.match(schema, /deleteSurface/);
    assert.match(schema, /exactly one action/);
    assert.match(schema, /validateA2UIComponentGraph/);
    assert.match(schema, /Duplicate A2UI component id/);
    assert.match(schema, /Circular A2UI component reference/);
  });

  it("parses fenced A2UI blocks, removes them from markdown, and formats event payloads", async () => {
    const parser = await readText("apps/web/src/lib/a2ui/parser.ts");

    assert.match(parser, /A2UI_BLOCK_PATTERN/);
    assert.match(parser, /:::a2ui\\n\(\[\\s\\S\]\*\?\)\\n:::/);
    assert.match(parser, /extractA2UIBlocks/);
    assert.match(parser, /JSON\.parse/);
    assert.match(parser, /a2uiActionSchema\.parse/);
    assert.match(parser, /validateA2UIComponentGraph/);
    assert.match(parser, /formatA2UIEventMessage/);
    assert.match(parser, /a2uiEvent/);
  });

  it("renders forms, tables, charts, and wizards with data binding and client-native actions", async () => {
    const [surface, state, actions] = await Promise.all([
      readText("apps/web/src/components/A2UISurface.tsx"),
      readText("apps/web/src/lib/a2ui/state.ts"),
      readText("apps/web/src/lib/a2ui/actions.ts"),
    ]);

    assert.match(state, /getValueByPath/);
    assert.match(state, /setValueByPath/);
    assert.match(actions, /ActionHandlerRegistry/);
    assert.match(actions, /agenthub:a2ui-event/);
    assert.match(actions, /register\("navigate"/);
    assert.match(actions, /register\("router\.push"/);
    assert.match(actions, /register\("form\.submit"/);
    assert.match(actions, /register\("api\.call"/);
    assert.match(actions, /register\("agent\.callback"/);
    assert.match(actions, /postEventPayload/);
    assert.match(surface, /data-testid="a2ui-surface"/);
    assert.match(surface, /data-testid="a2ui-text-field"/);
    assert.match(surface, /data-testid="a2ui-checkbox"/);
    assert.match(surface, /data-testid="a2ui-choice-picker"/);
    assert.match(surface, /data-testid="a2ui-table"/);
    assert.match(surface, /data-testid="a2ui-chart"/);
    assert.match(surface, /data-testid="a2ui-wizard"/);
    assert.match(surface, /ResponsiveContainer/);
    assert.match(surface, /localStorage\.setItem\(wizardStorageKey/);
    assert.match(surface, /validateComponentTree/);
    assert.match(surface, /defaultA2UIActionRegistry\.dispatch/);
    assert.match(surface, /endpoint: component\.action\.endpoint/);
    assert.match(surface, /method: component\.action\.method/);
  });

  it("integrates A2UI surfaces into chat messages and sends structured events back through chat", async () => {
    const [message, messageList, chatInterface] = await Promise.all([
      readText("apps/web/src/components/ChatMessage.tsx"),
      readText("apps/web/src/components/VirtualizedMessageList.tsx"),
      readText("apps/web/src/components/ChatInterface.tsx"),
    ]);

    assert.match(message, /extractA2UIBlocks/);
    assert.match(message, /A2UISurface/);
    assert.match(message, /data-testid="a2ui-surfaces"/);
    assert.match(messageList, /onA2UIEvent/);
    assert.match(chatInterface, /formatA2UIEventMessage/);
    assert.match(chatInterface, /handleA2UIEvent/);
    assert.match(chatInterface, /onA2UIEvent=\{handleA2UIEvent\}/);
  });
});
