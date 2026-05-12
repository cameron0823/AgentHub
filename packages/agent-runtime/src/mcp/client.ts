import { spawn, ChildProcess } from "child_process";

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
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
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
    } else {
      await this.connectHttp();
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
    await this.sendRequest("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "agenthub", version: "1.0.0" } });
    this.connected = true;

    // List tools
    const result = await this.sendRequest("tools/list", {}) as { tools?: MCPTool[] };
    this.tools = result.tools || [];
  }

  private async connectHttp(): Promise<void> {
    if (!this.options.url) throw new Error("URL required for HTTP transport");
    this.connected = true;

    // For HTTP, tools are fetched via GET /tools
    const res = await fetch(`${this.options.url}/tools`, {
      headers: this.options.headers,
    });
    if (res.ok) {
      const data = await res.json() as { tools?: MCPTool[] };
      this.tools = data.tools || [];
    }
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

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.connected) throw new Error("MCP client not connected");

    if (this.options.transport === "stdio") {
      return this.sendRequest("tools/call", { name, arguments: args });
    } else {
      const res = await fetch(`${this.options.url}/tools/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...this.options.headers },
        body: JSON.stringify(args),
      });
      if (!res.ok) throw new Error(`Tool call failed: ${await res.text()}`);
      return res.json();
    }
  }

  getTools(): MCPTool[] {
    return this.tools;
  }

  isConnected(): boolean {
    return this.connected;
  }

  disconnect(): void {
    this.connected = false;
    if (this.process) {
      this.process.kill();
      this.process = undefined;
    }
  }
}
