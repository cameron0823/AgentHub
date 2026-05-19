import { spawn, spawnSync } from "node:child_process";

const isWindows = process.platform === "win32";
const shell = isWindows;

const build = spawnSync("pnpm", ["run", "build"], {
  stdio: "inherit",
  shell,
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const electronBin = isWindows ? "electron.cmd" : "electron";
const child = spawn(electronBin, ["."], {
  stdio: "inherit",
  shell,
  env: {
    ...process.env,
    ELECTRON_DISABLE_SECURITY_WARNINGS: process.env.ELECTRON_DISABLE_SECURITY_WARNINGS ?? "false",
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
