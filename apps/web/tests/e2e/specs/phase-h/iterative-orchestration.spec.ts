import { test, expect } from "@playwright/test";
import { createE2EAgent, uniqueName } from "../../fixtures";

test.describe("Iterative orchestration", () => {
  test("creates and reloads an iterative author editor reviser group", async ({ page }) => {
    const author = await createE2EAgent(uniqueName("E2E Iterative Author"));
    const editor = await createE2EAgent(uniqueName("E2E Iterative Editor"));
    const reviser = await createE2EAgent(uniqueName("E2E Iterative Reviser"));
    const groupName = uniqueName("E2E Iterative Group");

    await page.goto("/");
    await page.getByRole("button", { name: /new group/i }).click();
    await expect(page.getByRole("heading", { name: "New Group" })).toBeVisible({ timeout: 15_000 });

    await page.fill("[name='name']", groupName);
    const pattern = page.locator("[name='pattern']");
    await expect(pattern).toContainText("Iterative");
    await pattern.selectOption("iterative");
    await expect(page.getByText("iterative flow")).toBeVisible();
    await expect(page.getByPlaceholder("Role: Author, Editor, Reviser").first()).toBeVisible();

    for (const [agent, role] of [
      [author, "Author"],
      [editor, "Editor"],
      [reviser, "Reviser"],
    ] as const) {
      const row = page.locator("label").filter({ hasText: agent.name }).locator("..");
      await row.locator("[data-testid='agent-checkbox']").check();
      await row.getByPlaceholder("Role: Author, Editor, Reviser").fill(role);
    }

    await page.getByRole("button", { name: /save group/i }).click();
    const savedGroup = page.getByTestId("group-card").filter({ hasText: groupName });
    await expect(savedGroup).toBeVisible({ timeout: 15_000 });
    await expect(savedGroup).toContainText("iterative · 3 agents");

    await page.reload();
    const reloadedGroup = page.getByTestId("group-card").filter({ hasText: groupName });
    await expect(reloadedGroup).toBeVisible({ timeout: 15_000 });
    await expect(reloadedGroup).toContainText(author.name);
    await expect(reloadedGroup).toContainText(editor.name);
    await expect(reloadedGroup).toContainText(reviser.name);
  });
});
