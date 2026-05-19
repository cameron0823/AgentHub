import { test, expect } from "@playwright/test";
import { createE2EDocument, createE2EKnowledgeBase, uniqueName } from "../../fixtures";

test.describe("Knowledge Base Upload", () => {
  test("user creates a knowledge base and sees the upload flow", async ({ page }) => {
    const kbName = uniqueName("E2E UI KB");

    await page.goto("/kb");
    await page.getByRole("button", { name: /new kb/i }).click();
    await page.getByPlaceholder("Knowledge base name").fill(kbName);
    await page.getByRole("button", { name: "Create" }).click();

    await expect(page.getByPlaceholder("Knowledge base name")).toBeHidden({ timeout: 20_000 });
    await expect(page.getByText(kbName)).toBeVisible({ timeout: 20_000 });
    await page.getByText(kbName).click();
    await expect(page.getByRole("button", { name: /upload document/i })).toBeVisible();
  });

  test("document appears in KB after chunking", async ({ page }) => {
    const kb = await createE2EKnowledgeBase(uniqueName("E2E Indexed KB"));
    const doc = await createE2EDocument(kb.id, `${uniqueName("E2E Indexed Doc")}.txt`);

    await page.goto("/kb");
    await page.getByText(kb.name).click();

    await expect(page.getByText(doc.name)).toBeVisible();
    await expect(page.getByText("indexed", { exact: true })).toBeVisible();
  });
});
