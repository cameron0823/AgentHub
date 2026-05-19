import { test, expect } from "@playwright/test";
import { createE2EAgent, uniqueName } from "../../fixtures";

test.describe("Projects and notebooks", () => {
  test("creates a project, links scope, and persists notebook documents", async ({ page }) => {
    const linkedAgent = await createE2EAgent(uniqueName("E2E Project Agent"));
    const projectName = uniqueName("E2E Project");
    const projectDescription = "Project scope and notebook persistence proof.";
    const notebookTitle = uniqueName("E2E Notebook Doc");
    const notebookContent = `Launch plan context available to chat ${Date.now()}.`;

    await page.goto("/projects");
    await expect(page.getByTestId("persistent-route-nav")).toBeVisible();
    await expect(page.getByTestId("persistent-home-link")).toBeVisible();
    await expect(page.getByTestId("projects-manager")).toBeVisible();

    await page.getByLabel("Project name").fill(projectName);
    await page.getByLabel("Project description").fill(projectDescription);
    await page.getByRole("button", { name: "New Project" }).click();
    await expect(page.getByRole("heading", { name: projectName })).toBeVisible({ timeout: 15_000 });

    await page.getByLabel("Resource kind").selectOption("agent");
    await page.getByLabel("Resource UUID").fill(linkedAgent.id);
    await page.getByRole("button", { name: "Link resource" }).click();

    await expect(page.getByRole("heading", { name: "Project scope" })).toBeVisible();
    await expect(page.getByText("Agents")).toBeVisible();
    await expect(page.getByText(linkedAgent.name)).toBeVisible({ timeout: 15_000 });

    await expect(page.getByRole("heading", { name: "Notebook" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Link resource" })).toBeVisible();
    await page.getByLabel("Notebook title").fill(notebookTitle);
    await page.getByLabel("Notebook content").fill(notebookContent);
    await page.getByRole("button", { name: "Add notebook doc" }).click();

    await expect(page.getByText(notebookTitle)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(notebookContent)).toBeVisible();
    await page.getByLabel("Search notebook").fill("Launch plan context");
    await expect(page.getByText(notebookTitle)).toBeVisible();

    await page.reload();
    await page.getByRole("button", { name: new RegExp(projectName) }).click();
    await expect(page.getByText(linkedAgent.name)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(notebookTitle)).toBeVisible();
    await expect(page.getByText(notebookContent)).toBeVisible();
  });
});
