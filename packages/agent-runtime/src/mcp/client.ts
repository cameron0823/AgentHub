import { createHash } from "crypto";
import { spawn, ChildProcess } from "child_process";

export type MCPTransport = "stdio" | "http" | "streamable-http" | "sse";

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPResource {
  uri: string;
  name: string;
  mimeType?: string;
}

export interface MCPClientOptions {
  transport: MCPTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export interface MCPHealthResult {
  ok: boolean;
  transport: MCPTransport;
  connected: boolean;
  toolCount: number;
  latencyMs: number;
  checkedAt: string;
  schemaFingerprint?: string;
  error?: string;
}

export interface ToolSchemaDiff {
  added: string[];
  removed: string[];
  changed: string[];
}

interface JsonRpcResponse {
  id?: number;
  result?: unknown;
  error?: { message?: string; code?: number; data?: unknown };
}

function normalizeToolSchema(tools: MCPTool[]): MCPTool[] {
  return [...tools]
    .map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      inputSchema: tool.inputSchema ?? {},
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function createToolSchemaFingerprint(tools: MCPTool[]): string {
  return hashJson(normalizeToolSchema(tools));
}

export function diffToolSchemas(previous: MCPTool[] | null | undefined, next: MCPTool[]): ToolSchemaDiff {
  const before = new Map(normalizeToolSchema(previous ?? []).map((tool) => [tool.name, hashJson(tool)]));
  const after = new Map(normalizeToolSchema(next).map((tool) => [tool.name, hashJson(tool)]));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const [name, nextHash] of after.entries()) {
    const previousHash = before.get(name);
    if (!previousHash) added.push(name);
    else if (previousHash !== nextHash) changed.push(name);
  }
  for (const name of before.keys()) {
    if (!after.has(name)) removed.push(name);
  }

  return { added, removed, changed };
}

export function parseSseJsonRpcResponse(body: string, expectedId?: number): JsonRpcResponse {
  const candidates: JsonRpcResponse[] = [];
  let dataLines: string[] = [];

  const flush = () => {
    if (dataLines.length === 0) return;
    const payload = dataLines.join("\n").trim();
    dataLines = [];
    if (!payload || payload === "[DONE]") return;
    try {
      candidates.push(JSON.parse(payload) as JsonRpcResponse);
    } catch {
      // Ignore keepalive or non-JSON SSE events.
    }
  };

  for (const line of body.split(/\r?\n/)) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    } else if (!line.trim()) {
      flush();
    }
  }
  flush();

  const matched = candidates.find((message) => expectedId === undefined || message.id === expectedId);
  if (matched) return matched;
  if (candidates[0]) return candidates[0];
  throw new Error("No JSON-RPC response found in SSE stream");
}

export class MCPClient {
  private options: MCPClientOptions;
  private process?: ChildProcess;
  private requestId = 0;
  private pendingRequests = new Map<number, { resolve: (value: unknown) => void; reject: (reason: Error) => void }>();
  private buffer = "";
  private tools: MCPTool[] = [];
  private connected = false;

  constructor(options: MCPClientOptions) {
    this.options = options;
  }

  async connect(): Promise<void> {
    if (this.options.transport === "stdio") {
      await this.connectStdio();
    } else if (this.options.transport === "http") {
      await this.connectHttp();
    } else {
      await this.connectStreamableHttp();
    }
  }

  private async connectStdio(): Promise<void> {
    if (!this.options.command) throw new Error("Command required for stdio transport");

    this.process = spawn(this.options.command, this.options.args || [], {
      env: { ...process.env, ...this.options.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.process.stdout?.on("data", (data: Buffer) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      console.error(`MCP stderr: ${data.toString()}`);
    });

    this.process.on("error", (err) => {
      console.error("MCP process error:", err);
    });

    this.process.on("close", (code) => {
      this.connected = false;
      console.log(`MCP process exited with code ${code}`);
    });

    // Initialize
    await this.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "agenthub", version: "1.0.0" },
    });
    this.connected = true;

    // List tools
    const result = (await this.sendRequest("tools/list", {})) as { tools?: MCPTool[] };
    this.tools = result.tools || [];
  }

  private async connectHttp(): Promise<void> {
    if (!this.options.url) throw new Error("URL required for HTTP transport");
    this.connected = true;

    // Legacy HTTP mode keeps AgentHub's original REST-style MCP adapter behavior.
    const res = await fetch(`${this.options.url}/tools`, {
      headers: this.options.headers,
    });
    if (!res.ok) {
      throw new Error(`MCP HTTP tool discovery failed: ${await res.text()}`);
    }
    const data = (await res.json()) as { tools?: MCPTool[] };
    this.tools = data.tools || [];
  }

  private async connectStreamableHttp(): Promise<void> {
    await this.sendHttpJsonRpcRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "agenthub", version: "1.0.0" },
    });
    this.connected = true;
    const result = (await this.sendHttpJsonRpcRequest("tools/list", {})) as { tools?: MCPTool[] };
    this.tools = result.tools || [];
  }

  private processBuffer() {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line) as { id?: number; result?: unknown; error?: { message: string } };
        if (message.id !== undefined) {
          const pending = this.pendingRequests.get(message.id);
          if (pending) {
            this.pendingRequests.delete(message.id);
            if (message.error) {
              pending.reject(new Error(message.error.message));
            } else {
              pending.resolve(message.result);
            }
          }
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  private sendRequest(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.requestId++;
      const id = this.requestId;
      this.pendingRequests.set(id, { resolve, reject });

      const message = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
      this.process?.stdin?.write(message);

      // Timeout after 30s
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 30000);
    });
  }

  private async sendHttpJsonRpcRequest(method: string, params: unknown): Promise<unknown> {
    if (!this.options.url) throw new Error(`URL required for ${this.options.transport} transport`);
    this.requestId++;
    const id = this.requestId;
    const res = await fetch(this.options.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...this.options.headers,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`MCP ${this.options.transport} request failed: ${body}`);

    const contentType = res.headers.get("content-type") ?? "";
    const message =
      contentType.includes("text/event-stream") || body.includes("data:")
        ? parseSseJsonRpcResponse(body, id)
        : (JSON.parse(body) as JsonRpcResponse);
    if (message.error) {
      throw new Error(message.error.message ?? `MCP ${method} failed`);
    }
    return message.result;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.connected) throw new Error("MCP client not connected");

    if (this.options.transport === "stdio") {
      return this.sendRequest("tools/call", { name, arguments: args });
    } else if (this.options.transport === "http") {
      const res = await fetch(`${this.options.url}/tools/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...this.options.headers },
        body: JSON.stringify(args),
      });
      if (!res.ok) throw new Error(`Tool call failed: ${await res.text()}`);
      return res.json();
    }
    return this.sendHttpJsonRpcRequest("tools/call", { name, arguments: args });
  }

  getTools(): MCPTool[] {
    return this.tools;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async healthCheck(): Promise<MCPHealthResult> {
    const startedAt = Date.now();
    try {
      if (!this.connected) await this.connect();
      return {
        ok: true,
        transport: this.options.transport,
        connected: this.connected,
        toolCount: this.tools.length,
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
        schemaFingerprint: createToolSchemaFingerprint(this.tools),
      };
    } catch (err) {
      return {
        ok: false,
        transport: this.options.transport,
        connected: false,
        toolCount: 0,
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  disconnect(): void {
    this.connected = false;
    if (this.process) {
      this.process.kill();
      this.process = undefined;
    }
  }
}
