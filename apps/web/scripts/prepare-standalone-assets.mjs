#!/usr/bin/env node
import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptRoot, "..");
const standaloneRoot = path.join(webRoot, ".next", "standalone", "apps", "web");

if (!existsSync(path.join(standaloneRoot, "server.js"))) {
  throw new Error("Next standalone server is missing. Run `pnpm -C apps/web build` first.");
}

const staticSource = path.join(webRoot, ".next", "static");
const staticTarget = path.join(standaloneRoot, ".next", "static");
if (existsSync(staticSource)) {
  await rm(staticTarget, { recursive: true, force: true });
  await mkdir(path.dirname(staticTarget), { recursive: true });
  await cp(staticSource, staticTarget, { recursive: true });
}

const publicSource = path.join(webRoot, "public");
const publicTarget = path.join(standaloneRoot, "public");
if (existsSync(publicSource)) {
  await rm(publicTarget, { recursive: true, force: true });
  await cp(publicSource, publicTarget, { recursive: true });
}
