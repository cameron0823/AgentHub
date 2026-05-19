#!/usr/bin/env node
import { spawn } from "node:child_process";

delete process.env.NO_COLOR;

const command = process.platform === "win32" ? "playwright.cmd" : "playwright";
const child = spawn(command, ["test", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: process.env,
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
