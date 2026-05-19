#!/usr/bin/env node

import { runCommitCommand } from "./commit.js";
import { runHeteroExec } from "./hetero-exec.js";
import { runI18nCommand } from "./i18n.js";
import { runLabelCommand } from "./label.js";

export function printUsage(output: Pick<NodeJS.WriteStream, "write"> = process.stderr) {
  output.write(
    [
      "Usage:",
      "  agenthub commit [--type <type>] [--scope <scope>] [--subject <text>] [--staged] [--write]",
      "  agenthub hetero exec --agent <id> --input <file> [--api-url <url>] [--api-key <key>]",
      "  agenthub i18n [--messages-dir <dir>] [--base <locale>] [--locale <locale>] [--write]",
      "  agenthub label --source <file> (--target <owner/repo> | --target-file <file>) [--write]",
      "",
      "Options:",
      "  --arg <value>          Additional CLI arg passed as a structured array item",
      "  --session <id>         Existing AgentHub chat session to append to",
      "  --yes                  Auto-approve headless HITL prompts",
      "  --non-interactive      Fail instead of prompting for HITL approval",
      "",
    ].join("\n"),
  );
}

export async function runAgentHubCli(argv = process.argv.slice(2)) {
  const [scope, command, ...rest] = argv;

  if (scope === "commit") {
    await runCommitCommand(argv.slice(1));
    return;
  }

  if (scope === "hetero" && command === "exec") {
    await runHeteroExec(rest);
    return;
  }

  if (scope === "i18n") {
    await runI18nCommand(argv.slice(1));
    return;
  }

  if (scope === "label") {
    await runLabelCommand(argv.slice(1));
    return;
  }

  printUsage();
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAgentHubCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
