import { test, expect } from "@playwright/test";

test.describe("Remote Agent Marketplace", () => {
  test("remote marketplace item can be inspected before install", async ({ page }) => {
    const remoteItem = {
      summary: {
        schemaVersion: "agenthub.marketplace.v1",
        slug: "remote-research-pack",
        name: "Remote Research Pack",
        description: "remote marketplace item",
        author: "AgentHub E2E",
        license: "MIT",
        version: "1.0.0",
        sourceUrl: "https://example.test/remote-research-pack.json",
        upstreamId: "remote-research-pack",
        tags: ["research", "remote"],
        agentCount: 1,
        agents: [
          {
            localKey: "remote-researcher",
            name: "Remote Researcher",
            description: "Inspects remote research tasks.",
            model: "ollama:qwen2.5:7b",
            tools: ["datetime"],
            memoryEnabled: true,
          },
        ],
      },
      manifest: {
        schemaVersion: "agenthub.marketplace.v1",
        metadata: {
          slug: "remote-research-pack",
          name: "Remote Research Pack",
          description: "remote marketplace item",
          author: "AgentHub E2E",
          license: "MIT",
          version: "1.0.0",
          sourceUrl: "https://example.test/remote-research-pack.json",
          upstreamId: "remote-research-pack",
          tags: ["research", "remote"],
        },
        agents: [
          {
            localKey: "remote-researcher",
            name: "Remote Researcher",
            description: "Inspects remote research tasks.",
            systemPrompt: "Inspect remote research tasks.",
            model: "ollama:qwen2.5:7b",
            temperature: 0.7,
            maxTokens: 4096,
            tools: ["datetime"],
            memoryEnabled: true,
          },
        ],
      },
      source: "remote",
    };

    await page.route("**/api/trpc/marketplace.remoteCatalog**", async (route) => {
      await route.fulfill({
        json: [
          {
            result: {
              data: {
                json: {
                  items: [remoteItem],
                  warnings: [],
                  source: "remote",
                },
              },
            },
          },
        ],
      });
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Marketplace" }).click();
    await page.getByRole("button", { name: "Remote" }).click();

    const grid = page.getByTestId("remote-catalog-grid");
    await expect(grid).toContainText("remote marketplace item", { timeout: 15_000 });
    await expect(grid.getByRole("button", { name: "Install", exact: true })).toBeVisible();
    await expect(grid.getByRole("button", { name: "Fork" })).toBeVisible();

    await grid.getByRole("button", { name: "Preview" }).click();
    const preview = page.getByTestId("remote-agent-preview");
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("Remote Research Pack");
    await expect(preview).toContainText("AgentHub E2E");
  });
});
