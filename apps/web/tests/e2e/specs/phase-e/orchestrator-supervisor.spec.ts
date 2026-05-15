import { test, expect } from "@playwright/test";
import { createE2EAgent, uniqueName } from "../../fixtures";

test.describe("Supervisor Orchestrator", () => {
  test("user creates a supervisor group with visual pattern preview", async ({ page }) => {
    const supervisor = await createE2EAgent(uniqueName("E2E Supervisor"));
    const worker = await createE2EAgent(uniqueName("E2E Worker"));
    const groupName = uniqueName("E2E Supervisor Group");

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /new group/i })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /new group/i }).click();
    await expect(page.getByRole("heading", { name: "New Group" })).toBeVisible({ timeout: 15_000 });
    await page.fill("[name='name']", groupName);
    await page.selectOption("[name='pattern']", "supervisor");

    const supervisorCheckbox = page.locator("label").filter({ hasText: supervisor.name }).locator("[data-testid='agent-checkbox']");
    const workerCheckbox = page.locator("label").filter({ hasText: worker.name }).locator("[data-testid='agent-checkbox']");
    await expect(supervisorCheckbox).toBeVisible({ timeout: 15_000 });
    await supervisorCheckbox.check();
    await expect(workerCheckbox).toBeVisible({ timeout: 15_000 });
    await workerCheckbox.check();
    await expect(page.getByText("supervisor flow")).toBeVisible();

    await page.getByRole("button", { name: /save group/i }).click();
    await expect(page.getByTestId("group-list")).toContainText(groupName);
  });

  test("all orchestration patterns are selectable", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /new group/i }).click();

    const pattern = page.locator("[name='pattern']");
    for (const option of ["sequential", "parallel", "supervisor", "debate", "groupchat"]) {
      await pattern.selectOption(option);
      await expect(page.getByText(`${option} flow`)).toBeVisible();
    }
  });
});
