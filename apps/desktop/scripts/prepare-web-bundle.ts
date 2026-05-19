import { spawnSync } from "node:child_process";
import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const desktopRoot = process.cwd();
const repoRoot = path.resolve(desktopRoot, "../..");
const webRoot = path.join(repoRoot, "apps/web");
const resourcesRoot = path.join(desktopRoot, "resources/web");

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function capture(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  return result.status === 0 ? result.stdout.trim() : null;
}

async function removeBundledEnvFiles(root: string) {
  const entries = await readdir(root, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(root, entry.name);
      if (entry.isDirectory()) {
        await removeBundledEnvFiles(target);
        return;
      }

      if (entry.name === ".env" || entry.name.startsWith(".env.")) {
        await rm(target, { force: true });
      }
    }),
  );
}

async function materializeStandaloneHoistLinks(root: string) {
  const virtualStore = path.join(root, "node_modules/.pnpm");
  const hoistRoot = path.join(virtualStore, "node_modules");
  const appNodeModules = path.join(root, "apps/web/node_modules");
  const copiedTargets = new Set<string>();

  await rm(appNodeModules, { recursive: true, force: true });
  await mkdir(appNodeModules, { recursive: true });

  async function copyPackage(source: string, target: string) {
    if (copiedTargets.has(target)) {
      return;
    }
    copiedTargets.add(target);
    try {
      await stat(source);
    } catch {
      // pnpm can leave optional native package hoist links unresolved on unsupported platforms.
      // Those packages are not required by the Linux desktop bundle.
      return;
    }
    await rm(target, { recursive: true, force: true });
    await cp(source, target, {
      recursive: true,
      force: true,
      dereference: true,
    });
  }

  async function copyNodeModuleEntries(sourceRoot: string) {
    let entries;
    try {
      entries = await readdir(sourceRoot, { withFileTypes: true });
    } catch {
      return;
    }

    await Promise.all(
      entries
        .filter((entry) => !entry.name.startsWith("."))
        .map(async (entry) => {
          const source = path.join(sourceRoot, entry.name);
          if (entry.name.startsWith("@") && entry.isDirectory()) {
            const scopeTarget = path.join(appNodeModules, entry.name);
            await mkdir(scopeTarget, { recursive: true });
            const scopedEntries = await readdir(source, { withFileTypes: true });
            await Promise.all(
              scopedEntries.map((scopedEntry) =>
                copyPackage(path.join(source, scopedEntry.name), path.join(scopeTarget, scopedEntry.name)),
              ),
            );
            return;
          }

          await copyPackage(source, path.join(appNodeModules, entry.name));
        }),
    );
  }

  await copyNodeModuleEntries(hoistRoot);

  let packageDirs;
  try {
    packageDirs = await readdir(virtualStore, { withFileTypes: true });
  } catch {
    return;
  }

  await Promise.all(
    packageDirs
      .filter((entry) => entry.isDirectory() && entry.name !== "node_modules")
      .map((entry) => copyNodeModuleEntries(path.join(virtualStore, entry.name, "node_modules"))),
  );
  await rm(path.join(root, "node_modules"), { recursive: true, force: true });
}

async function main() {
  run("pnpm", ["-C", "apps/web", "build"]);

  await rm(resourcesRoot, { recursive: true, force: true });
  await mkdir(resourcesRoot, { recursive: true });

  await cp(path.join(webRoot, ".next/standalone"), resourcesRoot, {
    recursive: true,
    force: true,
    dereference: false,
  });

  await cp(path.join(webRoot, ".next/static"), path.join(resourcesRoot, "apps/web/.next/static"), {
    recursive: true,
    force: true,
  });

  await cp(path.join(webRoot, "public"), path.join(resourcesRoot, "apps/web/public"), {
    recursive: true,
    force: true,
  });

  await materializeStandaloneHoistLinks(resourcesRoot);
  await removeBundledEnvFiles(resourcesRoot);

  await writeFile(
    path.join(resourcesRoot, "bundle-manifest.json"),
    `${JSON.stringify(
      {
        app: "agenthub",
        buildTime: new Date().toISOString(),
        gitSha: capture("git", ["rev-parse", "--short", "HEAD"]),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
