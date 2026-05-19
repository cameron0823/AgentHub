import { test, expect } from "@playwright/test";

test.describe("General HITL approvals", () => {
  test("approval panel supports action approvals and legacy checkpoints", async ({ page }) => {
    const decisions: Array<Record<string, unknown>> = [];
    let streamMode: "approval" | "checkpoint" = "approval";
    await page.route("**/api/chat/stream", async (route) => {
      const body =
        streamMode === "approval"
          ? [
              {
                type: "approval_request",
                approvalId: "e2e-tool-approval",
                request: {
                  title: "Human approval required",
                  prompt: "Approve this tool action before it runs.",
                  toolName: "execute_code",
                  argsPreview: '{"language":"python"}',
                  policyReason: "Sensitive tool requires human approval.",
                },
              },
              { type: "done" },
            ]
          : [
              {
                type: "hitl_checkpoint",
                checkpointId: "e2e-checkpoint",
                title: "Approve delegation plan?",
                plan: "Group checkpoint",
              },
              { type: "done" },
            ];
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: body.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join(""),
      });
    });
    await page.route("**/api/chat/checkpoint", async (route) => {
      decisions.push((route.request().postDataJSON() ?? {}) as Record<string, unknown>);
      await route.fulfill({ json: { ok: true } });
    });

    await page.goto("/");
    await page.getByTestId("new-chat-button").click();

    const composer = page.getByPlaceholder(/Message your local AI/i);
    await composer.fill("Run governed Python code");
    await page.getByLabel("Send message").click();

    const approval = page.getByTestId("hitl-approval");
    await expect(approval).toBeVisible({ timeout: 15_000 });
    await expect(approval).toContainText("Human approval required");
    await expect(approval).toContainText("Tool action approval: execute_code");
    await expect(approval).toContainText('{"language":"python"}');
    await expect(approval.getByRole("button", { name: "Approve & Continue" })).toBeVisible();
    await expect(approval.getByRole("button", { name: "Reject" })).toBeVisible();
    await approval.getByRole("button", { name: "Approve & Continue" }).click();
    await expect(approval).toBeHidden();
    expect(decisions[0]).toMatchObject({ approvalId: "e2e-tool-approval", approved: true });

    streamMode = "checkpoint";
    await composer.fill("Review the delegation checkpoint");
    await page.getByLabel("Send message").click();

    const checkpoint = page.getByTestId("legacy-checkpoint");
    await expect(checkpoint).toBeVisible({ timeout: 15_000 });
    await expect(checkpoint).toContainText("Approve delegation plan?");
    await expect(checkpoint).toContainText("Group checkpoint");
    await checkpoint.getByRole("button", { name: "Reject" }).click();
    await expect(checkpoint).toBeHidden();
    expect(decisions[1]).toMatchObject({ checkpointId: "e2e-checkpoint", approved: false });
  });
});
