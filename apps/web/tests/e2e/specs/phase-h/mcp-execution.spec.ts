import { test, expect } from "@playwright/test";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createE2EHttpMcpServer, uniqueName } from "../../fixtures";

function readJson(req: IncomingMessage) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(body ? (JSON.parse(body) as Record<string, unknown>) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

test.describe("MCP execution proof", () => {
  test("executes an allowed HTTP MCP tool and blocks a denied unsafe tool before dispatch", async ({
    page,
    context,
  }) => {
    const calls: string[] = [];
    const server = createServer(async (req, res) => {
      if (req.method === "GET" && req.url === "/tools") {
        sendJson(res, 200, {
          tools: [
            {
              name: "echo",
              description: "Echo text.",
              inputSchema: { type: "object", properties: { text: { type: "string" } } },
            },
            {
              name: "delete_all",
              description: "Unsafe destructive fixture tool.",
              inputSchema: { type: "object", properties: { target: { type: "string" } } },
            },
          ],
        });
        return;
      }

      if (req.method === "POST" && req.url === "/tools/echo") {
        calls.push("echo");
        const body = await readJson(req);
        sendJson(res, 200, { content: [{ type: "text", text: `echo:${body.text ?? ""}` }] });
        return;
      }

      if (req.method === "POST" && req.url === "/tools/delete_all") {
        calls.push("delete_all");
        sendJson(res, 200, { deleted: true });
        return;
      }

      sendJson(res, 404, { error: "not found" });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("MCP fixture server did not bind a TCP port");

    try {
      const mcpServer = await createE2EHttpMcpServer({
        name: uniqueName("E2E MCP Execution"),
        url: `http://127.0.0.1:${address.port}`,
        governancePolicy: {
          allowedTools: ["echo"],
          deniedTools: ["delete_all"],
        },
      });

      await page.goto("/");
      await expect(page.getByTestId("new-chat-button")).toBeVisible({ timeout: 15_000 });

      const allowed = await context.request.post("/api/mcp/call", {
        data: { serverId: mcpServer.id, toolName: "echo", args: { text: "allowed" } },
      });
      expect(allowed.status()).toBe(200);
      await expect(allowed).toBeOK();
      expect(await allowed.json()).toMatchObject({
        ok: true,
        serverId: mcpServer.id,
        toolName: "echo",
        result: { content: [{ type: "text", text: "echo:allowed" }] },
      });
      expect(calls).toEqual(["echo"]);

      const rejected = await context.request.post("/api/mcp/call", {
        data: { serverId: mcpServer.id, toolName: "delete_all", args: { target: "all" } },
      });
      expect(rejected.status()).toBe(403);
      expect(await rejected.json()).toMatchObject({
        error: {
          code: "mcp_tool_denied",
          message: "Tool delete_all is not allowed by MCP governance policy",
        },
      });
      expect(calls).toEqual(["echo"]);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
