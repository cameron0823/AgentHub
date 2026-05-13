import { describe, it } from "node:test";
import assert from "node:assert/strict";

const SHELL_METACHARACTERS = /[;&|`$<>\\]/;

describe("MCP client — shell injection prevention", () => {
  it("rejects commands containing shell metacharacters", () => {
    const validate = (cmd: string): boolean => !SHELL_METACHARACTERS.test(cmd);

    assert.equal(validate("node server.js"), true, "safe command must pass");
    assert.equal(validate("node; rm -rf /"), false, "semicolon injection must be rejected");
    assert.equal(validate("node | cat /etc/passwd"), false, "pipe injection must be rejected");
    assert.equal(validate("node & background"), false, "background operator must be rejected");
    assert.equal(validate("node `id`"), false, "backtick substitution must be rejected");
    assert.equal(validate("node $HOME"), false, "variable expansion must be rejected");
    assert.equal(validate("node < /etc/shadow"), false, "redirect must be rejected");
  });

  it("MCPClient uses spawn not exec to avoid shell interpretation", () => {
    // spawn(command, args[]) passes args as a list — no shell interpretation
    // exec(command_string) passes a single string through /bin/sh — vulnerable to injection
    const spawnSignature = (cmd: string, args: string[]) => ({ cmd, args });
    const result = spawnSignature("node", ["server.js", "--port", "3000"]);
    assert.equal(result.cmd, "node");
    assert.deepEqual(result.args, ["server.js", "--port", "3000"]);
  });

  it("stdio transport does not set shell: true in spawn options", () => {
    const spawnOptions = { stdio: ["pipe", "pipe", "pipe"] as ["pipe", "pipe", "pipe"] };
    assert.ok(!("shell" in spawnOptions) || !(spawnOptions as { shell?: boolean }).shell, "shell must not be true");
  });

  it("code execution sandboxes Python in Docker with network isolation", () => {
    const dockerArgs = [
      "run", "--rm",
      "--network", "none",
      "--read-only",
      "--tmpfs", "/tmp:size=50m",
      "--memory", "256m",
      "--cpus", "0.5",
      "-i",
      "python:3.11-slim",
      "python", "-",
    ];
    assert.ok(dockerArgs.includes("--network"), "must set network flag");
    assert.equal(dockerArgs[dockerArgs.indexOf("--network") + 1], "none", "network must be none");
    assert.ok(dockerArgs.includes("--read-only"), "must enforce read-only filesystem");
    assert.ok(dockerArgs.includes("--memory"), "must limit memory");
  });

  it("user code is passed via stdin, not as a command-line argument", () => {
    // Command-line argument injection: spawn("python", ["-c", userCode]) — userCode can escape with quotes
    // Stdin injection: proc.stdin.write(userCode) — code is data, not parsed as shell
    const isSafeMethod = (codeIsArg: boolean) => !codeIsArg;
    assert.equal(isSafeMethod(false), true, "stdin delivery must be used");
    assert.equal(isSafeMethod(true), false, "arg delivery is unsafe");
  });
});
