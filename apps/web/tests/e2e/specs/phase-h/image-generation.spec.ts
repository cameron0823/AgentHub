import { test, expect } from "@playwright/test";
import { createE2ESessionWithAssistantMetadata, uniqueName } from "../../fixtures";

test.describe("Image generation rendering", () => {
  test("renders generated image resources in assistant messages", async ({ page }) => {
    const sessionTitle = uniqueName("E2E Image Generation");
    await createE2ESessionWithAssistantMetadata(sessionTitle, {
      generatedResources: [
        {
          id: "e2e-generated-image",
          type: "image",
          url: "data:image/png;base64,iVBORw0KGgo=",
          prompt: "A generated dashboard concept",
          revisedPrompt: "A generated dashboard concept",
          providerId: "e2e-provider",
          model: "e2e-image-model",
        },
      ],
    });

    await page.goto("/");
    await page.getByTestId("session-row").filter({ hasText: sessionTitle }).click();

    await expect(page.getByText("Generated Images")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByAltText("A generated dashboard concept")).toBeVisible();
    await expect(page.getByText("e2e-provider / e2e-image-model")).toBeVisible();
  });
});
