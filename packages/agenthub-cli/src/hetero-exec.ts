import { readFile } from "node:fs/promises";
import { stdin as defaultStdin, stdout as defaultStdout, stderr as defaultStderr } from "node:process";
import { createInterface } from "node:readline/promises";

const DEFAULT_API_URL = "http://127.0.0.1:3000";

export interface ParsedHeteroExecArgs {
  agentId: string;
  inputFile: string;
  apiUrl: string;
  apiKey: string;
  args: string[];
  sessionId?: string;
  yes: boolean;
  nonInteractive: boolean;
}

export interface HeteroExecRequest {
  agentId: string;
  input: string;
  inputFileName: string;
  args: string[];
  sessionId?: string;
  stream: true;
}

interface HitlRequestEvent {
  type: "hitl_request";
  id?: string;
  prompt?: string;
  callbackUrl?: string;
}

type OutputEvent =
  | { type: "session"; sessionId: string; runId: string }
  | { type: "stdout"; content: string }
  | { type: "stderr"; content: string }
  | { type: "status"; status: string; message?: string }
  | { type: "done"; sessionId: string; runId: string; status: string; output?: string; error?: string }
  | HitlRequestEvent;

export function parseHeteroExecArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): ParsedHeteroExecArgs {
  const parsed: ParsedHeteroExecArgs = {
    agentId: "",
    inputFile: "",
    apiUrl: env.AGENTHUB_API_URL ?? DEFAULT_API_URL,
    apiKey: env.AGENTHUB_API_KEY ?? "",
    args: [],
    yes: false,
    nonInteractive: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${token} requires a value.`);
      index += 1;
      return value;
    };

    switch (token) {
      case "--agent":
        parsed.agentId = next();
        break;
      case "--input":
        parsed.inputFile = next();
        break;
      case "--api-url":
        parsed.apiUrl = next();
        break;
      case "--api-key":
        parsed.apiKey = next();
        break;
      case "--arg":
        parsed.args.push(next());
        break;
      case "--session":
        parsed.sessionId = next();
        break;
      case "--yes":
        parsed.yes = true;
        break;
      case "--non-interactive":
        parsed.nonInteractive = true;
        break;
      default:
        throw new Error(`Unknown option: ${token}`);
    }
  }

  if (!parsed.agentId) throw new Error("Missing --agent <id>.");
  if (!parsed.inputFile) throw new Error("Missing --input <file>.");
  if (!parsed.apiKey) throw new Error("Missing AGENTHUB_API_KEY or --api-key.");
  parsed.apiUrl = parsed.apiUrl.replace(/\/+$/, "");
  return parsed;
}

async function readStdin(input: NodeJS.ReadStream = defaultStdin) {
  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function buildHeteroExecRequest(parsed: ParsedHeteroExecArgs): Promise<HeteroExecRequest> {
  const input = parsed.inputFile === "-" ? await readStdin() : await readFile(parsed.inputFile, "utf8");

  return {
    agentId: parsed.agentId,
    input,
    inputFileName: parsed.inputFile,
    args: parsed.args,
    sessionId: parsed.sessionId,
    stream: true,
  };
}

export async function promptForApproval(
  event: HitlRequestEvent,
  io: { input?: NodeJS.ReadStream; output?: NodeJS.WriteStream } = {},
) {
  const input = io.input ?? defaultStdin;
  const output = io.output ?? defaultStdout;
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(`${event.prompt ?? "Approve action?"} [y/N] `);
    return answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
  } finally {
    rl.close();
  }
}

export async function submitHitlDecision(
  apiUrl: string,
  apiKey: string,
  callbackUrl: string,
  approved: boolean,
  id?: string,
) {
  const target = callbackUrl.startsWith("http")
    ? callbackUrl
    : `${apiUrl}${callbackUrl.startsWith("/") ? "" : "/"}${callbackUrl}`;
  const decisionBody = id ? { approvalId: id, checkpointId: id, approved } : { approved };
  const response = await fetch(target, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(decisionBody),
  });
  if (!response.ok) throw new Error(`HITL callback failed: ${response.status}`);
}

async function handleEvent(
  event: OutputEvent,
  parsed: ParsedHeteroExecArgs,
  io: { stdout?: NodeJS.WriteStream; stderr?: NodeJS.WriteStream } = {},
) {
  const out = io.stdout ?? defaultStdout;
  const err = io.stderr ?? defaultStderr;

  if (event.type === "stdout") out.write(event.content);
  if (event.type === "stderr") err.write(event.content);
  if (event.type === "status" && event.message) err.write(`${event.message}\n`);
  if (event.type === "done") {
    err.write(`AgentHub session: ${event.sessionId}\n`);
    if (event.error) err.write(`${event.error}\n`);
  }
  if (event.type === "hitl_request") {
    if (!event.callbackUrl) throw new Error("HITL request is missing callbackUrl.");
    if (parsed.nonInteractive && !parsed.yes) throw new Error("HITL approval required in non-interactive mode.");
    const approved = parsed.yes ? true : await promptForApproval(event);
    await submitHitlDecision(parsed.apiUrl, parsed.apiKey, event.callbackUrl, approved, event.id);
  }
}

async function consumeSse(response: Response, parsed: ParsedHeteroExecArgs) {
  if (!response.body) throw new Error("AgentHub API response did not include a body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (!data || data === "[DONE]") continue;
      await handleEvent(JSON.parse(data) as OutputEvent, parsed);
    }
  }
}

export async function runHeteroExec(argv: string[]) {
  const parsed = parseHeteroExecArgs(argv);
  const request = await buildHeteroExecRequest(parsed);
  const response = await fetch(`${parsed.apiUrl}/api/cli/hetero/exec`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      Authorization: `Bearer ${parsed.apiKey}`,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AgentHub API request failed: ${response.status} ${text}`);
  }

  await consumeSse(response, parsed);
}
