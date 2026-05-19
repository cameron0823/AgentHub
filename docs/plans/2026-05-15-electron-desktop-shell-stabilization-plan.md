# Electron Desktop Shell Stabilization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.
> **Status:** Archived desktop plan pack. Root `TODO.md` is the canonical current tracker and completion source.

**Goal:** Build AgentHub as an Electron desktop shell around the existing Next.js app first, then stabilize desktop auth, updates, and local-service startup without changing the core web architecture or enabling broad native access.

**Architecture:** `apps/web` remains the canonical product UI and server implementation. `apps/desktop` is a native shell that either loads a running local AgentHub web server in development or launches the packaged Next standalone server on a loopback-only dynamic port in production. Native power is exposed only through a narrow, typed preload bridge with explicit IPC allowlists, sender validation, and feature flags.

**Tech Stack:** Electron, TypeScript, Next.js 15 standalone output, pnpm workspaces, Turbo, tRPC, Drizzle/PostgreSQL/pgvector, NextAuth, Playwright, Node test runner, electron-builder/electron-updater, electron-log.

---

## Primary References

- Electron security guidance: keep Node integration out of renderers, keep context isolation and sandboxing enabled, validate IPC senders, and avoid broad renderer privileges.
- Electron autoUpdater guidance: macOS auto-update requires signing; Windows updater behavior depends on package type; avoid duplicate update checks.
- electron-builder auto-update guidance: `electron-updater` handles release metadata and update checks; packaged update testing should use real installed builds where possible.

Use current upstream docs during implementation before adding exact dependency versions:

- https://www.electronjs.org/docs/latest/tutorial/security
- https://www.electronjs.org/docs/latest/api/auto-updater
- https://www.electron.build/auto-update.html

## Current AgentHub Constraints

- Root scripts discovered from `package.json`:
  - `pnpm dev`
  - `pnpm build`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm test:e2e`
  - `pnpm typecheck`
  - `pnpm db:migrate`
  - `pnpm db:push`
  - `pnpm validate`
- Web app scripts discovered from `apps/web/package.json`:
  - `pnpm -C apps/web dev`
  - `pnpm -C apps/web build`
  - `pnpm -C apps/web start`
  - `pnpm -C apps/web lint`
  - `pnpm -C apps/web test`
  - `pnpm -C apps/web test:e2e`
  - `pnpm -C apps/web typecheck`
- `apps/web/next.config.js` already uses `output: "standalone"`, which is the right foundation for packaged local server startup.
- Current local infrastructure comes from `docker-compose.yml`: PostgreSQL/pgvector, Redis, MinIO, Casdoor, SearXNG, and the AgentHub container.
- `apps/web/src/server/auth.ts` has a dev-only credentials provider and Casdoor OAuth. Desktop work must stabilize auth callback origins before packaging.
- Existing roadmap already gates desktop/local-file/CLI features: they stay disabled in web-only mode until Electron permissions exist.

## Non-Goals For The First Desktop Milestone

- Do not rewrite the web app in a separate desktop renderer.
- Do not migrate the primary database from PostgreSQL to SQLite/local-first storage.
- Do not enable arbitrary filesystem access.
- Do not expose `ipcRenderer`, `child_process`, `fs`, or shell execution directly to the renderer.
- Do not turn on MCP STDIO, local CLI mounts, or broad file snapshots until the shell, auth, updater, and service startup are stable.
- Do not require Docker-managed local services for the first shell milestone; detect and report missing services first.

## Milestone Order

1. **Desktop Shell MVP:** Electron window, secure preload bridge, runtime detection, local Next server launch, basic health view.
2. **Auth Stability:** loopback/callback correctness, desktop-safe sign-in/sign-out, OAuth handoff strategy, no hardcoded port assumptions.
3. **Updater Stability:** packaged builds, logging, update metadata, signed-release path, staged channel validation.
4. **Local-Service Stability:** explicit service ledger, health checks, guided setup, optional Docker Compose orchestration.
5. **Carefully Scoped Native Capabilities:** keychain, file snapshots, MCP STDIO, CLI mounting, tray/global commands.

## Desktop Runtime Contract

The only renderer-visible API is `window.agenthubDesktop`.

Initial allowed methods:

```ts
type DesktopRuntimeInfo = {
  isDesktop: true;
  platform: NodeJS.Platform;
  appVersion: string;
  webOrigin: string;
  services: {
    web: "starting" | "healthy" | "unhealthy";
    database: "unknown" | "healthy" | "unhealthy";
    redis: "unknown" | "healthy" | "unhealthy";
    objectStorage: "unknown" | "healthy" | "unhealthy";
  };
};

type AgentHubDesktopApi = {
  getRuntimeInfo(): Promise<DesktopRuntimeInfo>;
  getWindowState(): Promise<{ width: number; height: number; x?: number; y?: number; maximized: boolean }>;
  setWindowState(state: { width: number; height: number; x?: number; y?: number; maximized: boolean }): Promise<void>;
  openExternal(url: string): Promise<{ ok: true } | { ok: false; error: string }>;
};
```

Methods that must remain unavailable until later tasks add tests and explicit permission UI:

- `selectFileSnapshot`
- `readLocalFile`
- `writeLocalFile`
- `runMcpStdio`
- `runCliCommand`
- `keychainGet`
- `keychainSet`

## Task 1: Desktop Architecture Guardrails

**Files:**

- Create: `docs/adr/0001-electron-desktop-shell.md`
- Create: `docs/desktop/security-contract.md`
- Create: `tests/desktop-architecture.test.mjs`
- Modify: `docs/plans/2026-05-15-lobehub-feature-task-plans.md`

**Step 1: Write the failing test**

Create `tests/desktop-architecture.test.mjs` with source checks for:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("desktop ADR keeps web as canonical runtime", async () => {
  const adr = await readText("docs/adr/0001-electron-desktop-shell.md");
  assert.match(adr, /apps\\/web remains the canonical product UI/);
  assert.match(adr, /apps\\/desktop is a shell/);
  assert.match(adr, /No arbitrary filesystem access/);
});

test("desktop security contract requires safe Electron defaults", async () => {
  const contract = await readText("docs/desktop/security-contract.md");
  assert.match(contract, /nodeIntegration: false/);
  assert.match(contract, /contextIsolation: true/);
  assert.match(contract, /sandbox: true/);
  assert.match(contract, /validateSender/);
  assert.doesNotMatch(contract, /expose ipcRenderer/);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec node --test tests/desktop-architecture.test.mjs
```

Expected: FAIL because the ADR and security contract do not exist.

**Step 3: Add the architecture docs**

`docs/adr/0001-electron-desktop-shell.md` must record:

- Decision: Electron shell around existing Next app.
- Alternatives rejected: full desktop rewrite, immediate local-first sync, broad native bridge.
- Data decision: PostgreSQL remains canonical for now.
- Desktop-only permission boundary.
- How this relates to P42.3.

`docs/desktop/security-contract.md` must record:

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- no `webview` unless separately approved
- `setWindowOpenHandler` deny-by-default
- permission request handler deny-by-default
- CSP must remain enabled by the web app
- IPC channel allowlist
- `event.senderFrame` validation
- native operations require user intent and audit logs

**Step 4: Update P42.3 pointer**

Update `docs/plans/2026-05-15-lobehub-feature-task-plans.md` P42.3 so it links to this detailed plan instead of being the only desktop task description.

**Step 5: Verify**

Run:

```bash
pnpm exec node --test tests/desktop-architecture.test.mjs
pnpm test
```

Expected: both pass.

**Step 6: Commit**

```bash
git add docs/adr/0001-electron-desktop-shell.md docs/desktop/security-contract.md docs/plans/2026-05-15-lobehub-feature-task-plans.md tests/desktop-architecture.test.mjs
git commit -m "docs: define desktop shell architecture"
```

## Task 2: Desktop Workspace Scaffold

**Files:**

- Create: `apps/desktop/package.json`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/tsconfig.build.json`
- Create: `apps/desktop/src/main/index.ts`
- Create: `apps/desktop/src/main/create-window.ts`
- Create: `apps/desktop/src/preload/index.ts`
- Create: `apps/desktop/src/shared/desktop-api.ts`
- Create: `apps/desktop/src/shared/ipc-channels.ts`
- Modify: `turbo.json`
- Test: `tests/desktop-workspace.test.mjs`

`pnpm-workspace.yaml` already includes `apps/*`, so no workspace glob change is needed unless implementation chooses a different folder.

**Step 1: Write the failing test**

Create `tests/desktop-workspace.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readJson = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));
const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("desktop package exposes required scripts", async () => {
  const pkg = await readJson("apps/desktop/package.json");
  for (const script of ["dev", "build", "typecheck", "test", "package"]) {
    assert.ok(pkg.scripts[script], `missing desktop script ${script}`);
  }
  assert.ok(pkg.devDependencies.electron);
});

test("desktop shell uses a preload and safe window defaults", async () => {
  const main = await readText("apps/desktop/src/main/create-window.ts");
  assert.match(main, /preload:/);
  assert.match(main, /nodeIntegration: false/);
  assert.match(main, /contextIsolation: true/);
  assert.match(main, /sandbox: true/);
});

test("preload exposes only agenthubDesktop", async () => {
  const preload = await readText("apps/desktop/src/preload/index.ts");
  assert.match(preload, /contextBridge\\.exposeInMainWorld\\("agenthubDesktop"/);
  assert.doesNotMatch(preload, /ipcRenderer\\s*[,}]/);
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm exec node --test tests/desktop-workspace.test.mjs
```

Expected: FAIL because `apps/desktop` is missing.

**Step 3: Add package and scripts**

`apps/desktop/package.json` should add scripts that exist after this task:

```json
{
  "name": "@agenthub/desktop",
  "version": "0.1.0",
  "private": true,
  "main": "dist/main/index.js",
  "scripts": {
    "dev": "tsx scripts/dev.ts",
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc --noEmit",
    "test": "node --test ../../tests/desktop-*.test.mjs",
    "package": "pnpm build && electron-builder --dir",
    "dist": "pnpm build && electron-builder"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "electron": "latest",
    "electron-builder": "latest",
    "tsx": "latest",
    "typescript": "^5.9.3"
  },
  "dependencies": {
    "zod": "^3.23.0"
  }
}
```

Before implementing, verify current stable versions and pin exact versions through `pnpm add -D -C apps/desktop ...` instead of hand-editing semver ranges.

**Step 4: Add safe shell skeleton**

`create-window.ts` must:

- create `BrowserWindow` with safe `webPreferences`
- deny unexpected new windows
- deny permission requests by default
- load `process.env.AGENTHUB_WEB_URL` in dev only
- show a local error page if no web URL is available

Initial `preload/index.ts` must expose only:

- `getRuntimeInfo`
- `getWindowState`
- `setWindowState`
- `openExternal`

**Step 5: Verify**

```bash
pnpm -C apps/desktop typecheck
pnpm exec node --test tests/desktop-workspace.test.mjs
pnpm typecheck
```

Expected: all pass.

**Step 6: Commit**

```bash
git add apps/desktop tests/desktop-workspace.test.mjs turbo.json
git commit -m "feat: scaffold electron desktop workspace"
```

## Task 3: Typed IPC Allowlist And Sender Validation

**Files:**

- Create: `apps/desktop/src/main/ipc.ts`
- Create: `apps/desktop/src/main/validate-sender.ts`
- Create: `apps/desktop/src/main/window-state.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/shared/ipc-channels.ts`
- Test: `tests/desktop-ipc.test.mjs`

**Step 1: Write the failing test**

Test requirements:

- every IPC channel is declared in `ipc-channels.ts`
- main process uses `ipcMain.handle`, not `ipcMain.on`
- every handler calls `validateSender`
- preload never exposes raw `ipcRenderer`
- no channel name includes generic strings like `exec`, `shell`, `fs`, or `readFile`

Run:

```bash
pnpm exec node --test tests/desktop-ipc.test.mjs
```

Expected: FAIL until IPC files exist.

**Step 2: Implement IPC contract**

Use channel names:

```ts
export const desktopIpcChannels = {
  getRuntimeInfo: "desktop:get-runtime-info",
  getWindowState: "desktop:get-window-state",
  setWindowState: "desktop:set-window-state",
  openExternal: "desktop:open-external",
} as const;
```

`validateSender(event.senderFrame)` must allow only:

- `http://127.0.0.1:<selectedPort>`
- `http://localhost:<selectedPort>` only if explicitly used by the service manager
- `app://agenthub` later, if a custom protocol is added

Use `new URL(frame.url)` and compare protocol, hostname, and port.

**Step 3: Add window-state persistence**

Persist state under Electron `app.getPath("userData")`, for example:

```text
<userData>/window-state.json
```

Validate bounds before restore:

- width min 960
- height min 640
- ignore coordinates that are not visible on any display

**Step 4: Verify**

```bash
pnpm -C apps/desktop typecheck
pnpm exec node --test tests/desktop-ipc.test.mjs
pnpm test
```

Expected: all pass.

**Step 5: Commit**

```bash
git add apps/desktop tests/desktop-ipc.test.mjs
git commit -m "feat: add secure desktop ipc foundation"
```

## Task 4: Local Web Server Manager

**Files:**

- Create: `apps/desktop/src/main/services/web-server.ts`
- Create: `apps/desktop/src/main/services/ports.ts`
- Create: `apps/desktop/src/main/services/health.ts`
- Create: `apps/web/src/app/api/health/route.ts`
- Modify: `apps/desktop/src/main/create-window.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Test: `tests/desktop-web-server.test.mjs`

**Step 1: Write the failing test**

Assert:

- `apps/web/src/app/api/health/route.ts` exists
- health route exports `runtime = "nodejs"`
- desktop service manager binds only `127.0.0.1`
- desktop service manager does not hardcode port `3000`
- child process cleanup exists for app shutdown
- log path uses `app.getPath("logs")` or `app.getPath("userData")`

Run:

```bash
pnpm exec node --test tests/desktop-web-server.test.mjs
```

Expected: FAIL.

**Step 2: Add web health route**

`apps/web/src/app/api/health/route.ts` should return:

```ts
export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    status: "ok",
    app: "agenthub",
    runtime: "nodejs",
    version: process.env.AGENTHUB_VERSION ?? "dev",
  });
}
```

Later service-health tasks can extend this with database/Redis/storage checks.

**Step 3: Implement port discovery**

Port strategy:

1. Respect `AGENTHUB_DESKTOP_PORT` if set and free.
2. Try `3001`, then `3002`, then dynamic free port.
3. Write the chosen port to desktop runtime info.
4. Never kill an existing process automatically.

**Step 4: Implement dev and production server modes**

Dev mode:

- if `AGENTHUB_WEB_URL` is set, load that URL and do not spawn a server
- otherwise spawn `pnpm -C apps/web dev -- --hostname 127.0.0.1 --port <port>` only if the command is fixed to work; if pnpm argument passing is problematic, spawn `pnpm -C apps/web exec next dev --hostname 127.0.0.1 --port <port>`

Production mode:

- after `pnpm -C apps/web build`, package `.next/standalone`, `.next/static`, and `public`
- spawn the standalone `server.js` from the packaged resources
- set `HOSTNAME=127.0.0.1`, `PORT=<selectedPort>`, `NEXTAUTH_URL=http://127.0.0.1:<selectedPort>`

**Step 5: Add shutdown cleanup**

On Electron app quit:

- stop child process tree
- wait for process exit
- close logs
- never leave orphaned `next-server` processes

**Step 6: Verify**

```bash
pnpm -C apps/web build
pnpm -C apps/desktop typecheck
pnpm exec node --test tests/desktop-web-server.test.mjs
pnpm build
```

Manual smoke after implementation:

```bash
AGENTHUB_WEB_URL=http://127.0.0.1:3001 pnpm -C apps/desktop dev
```

Expected:

- Electron window opens existing web app.
- Runtime info reports the web origin.
- Closing Electron stops only desktop-owned child processes.

**Step 7: Commit**

```bash
git add apps/desktop apps/web/src/app/api/health/route.ts tests/desktop-web-server.test.mjs
git commit -m "feat: launch local web server from desktop shell"
```

## Task 5: Web-Side Desktop Runtime Detection

**Files:**

- Create: `apps/web/src/lib/desktop-runtime.ts`
- Create: `apps/web/src/components/DesktopStatus.tsx`
- Modify: `apps/web/src/app/settings/page.tsx`
- Test: `tests/desktop-runtime-detection.test.mjs`

**Step 1: Write the failing test**

Assert:

- `desktop-runtime.ts` checks `window.agenthubDesktop`
- web code does not import Electron packages
- `DesktopStatus` renders only when desktop API exists
- settings page includes `DesktopStatus`

Run:

```bash
pnpm exec node --test tests/desktop-runtime-detection.test.mjs
```

Expected: FAIL.

**Step 2: Add detection helper**

Implementation contract:

```ts
export function hasDesktopRuntime() {
  return typeof window !== "undefined" && Boolean((window as any).agenthubDesktop);
}
```

Do not import from `apps/desktop`; duplicate a minimal browser-side type or place shared types in a neutral package only if duplication becomes painful.

**Step 3: Add status panel**

`DesktopStatus` should show:

- Desktop shell detected
- version
- platform
- web server health
- service health summary

No buttons for filesystem, keychain, CLI, or MCP yet.

**Step 4: Verify**

```bash
pnpm -C apps/web typecheck
pnpm exec node --test tests/desktop-runtime-detection.test.mjs
pnpm test
```

**Step 5: Commit**

```bash
git add apps/web/src/lib/desktop-runtime.ts apps/web/src/components/DesktopStatus.tsx apps/web/src/app/settings/page.tsx tests/desktop-runtime-detection.test.mjs
git commit -m "feat: detect desktop runtime in web app"
```

## Task 6: Desktop Auth Stabilization

**Files:**

- Create: `tests/desktop-auth.test.mjs`
- Modify: `apps/web/src/server/auth.ts`
- Modify: `apps/web/src/app/api/auth/[...nextauth]/route.ts` if route-specific config is needed
- Modify: `apps/desktop/src/main/services/web-server.ts`
- Modify: `apps/desktop/src/main/create-window.ts`
- Create: `docs/desktop/auth.md`

**Step 1: Write the failing test**

Assert:

- auth docs define loopback callback behavior
- desktop server manager sets `NEXTAUTH_URL` from selected local origin
- auth code does not hardcode `localhost:3000`
- Electron opens external OAuth URLs through `shell.openExternal`
- redirect handling returns to the local loopback app origin

Run:

```bash
pnpm exec node --test tests/desktop-auth.test.mjs
```

Expected: FAIL.

**Step 2: Stabilize first milestone auth**

For the first desktop milestone:

- use the existing dev credentials provider in local development
- set `NODE_ENV=development` only for dev shell
- production desktop must not depend on dev credentials unless a deliberate local-only auth mode is approved
- set `NEXTAUTH_URL=http://127.0.0.1:<selectedPort>` when desktop launches the local server
- set `NEXTAUTH_SECRET` from desktop config if not provided

**Step 3: Define OAuth handoff strategy**

For Casdoor/OIDC:

- BrowserWindow loads AgentHub local origin.
- External OAuth pages open in the system browser through controlled `openExternal`.
- Callback target is the local loopback URL first.
- Custom protocol `agenthub://auth/callback` is a later hardening task only if loopback callback is not reliable.

**Step 4: Add navigation controls**

In Electron:

- allow navigation only to the selected local AgentHub origin
- use `setWindowOpenHandler` to intercept external URLs
- block unknown protocols
- allow `https:` external links through `shell.openExternal` after URL validation

**Step 5: Add auth smoke**

Create a Playwright or Electron smoke script that:

1. starts desktop with a temporary profile
2. signs in using dev credentials in development mode
3. lands on `/settings`
4. signs out
5. verifies it returns to the sign-in screen

Suggested script after desktop scaffold exists:

```bash
pnpm -C apps/desktop test -- --auth-smoke
```

Only add this command after the package script exists.

**Step 6: Verify**

```bash
pnpm exec node --test tests/desktop-auth.test.mjs
pnpm -C apps/desktop typecheck
pnpm -C apps/web typecheck
pnpm test
```

**Step 7: Commit**

```bash
git add apps/desktop apps/web/src/server/auth.ts docs/desktop/auth.md tests/desktop-auth.test.mjs
git commit -m "feat: stabilize desktop auth origin handling"
```

## Task 7: Desktop Packaging Foundation

**Files:**

- Create: `apps/desktop/electron-builder.yml`
- Create: `apps/desktop/scripts/prepare-web-bundle.ts`
- Create: `apps/desktop/resources/README.md`
- Modify: `apps/desktop/package.json`
- Modify: `apps/web/next.config.js` only if standalone packaging reveals missing externals
- Test: `tests/desktop-packaging.test.mjs`

**Step 1: Write the failing test**

Assert:

- electron-builder config exists
- package includes the desktop dist and packaged web standalone output
- config excludes `.env.local`
- config excludes `data/postgres`, `data/redis`, and `data/minio`
- app has a stable app ID
- Windows target is explicit

Run:

```bash
pnpm exec node --test tests/desktop-packaging.test.mjs
```

Expected: FAIL.

**Step 2: Add web bundle preparation**

`prepare-web-bundle.ts` should:

1. run or require `pnpm -C apps/web build`
2. copy `apps/web/.next/standalone`
3. copy `apps/web/.next/static`
4. copy `apps/web/public`
5. write a manifest with build time and git SHA if available

Do not copy secrets or local data folders.

**Step 3: Add electron-builder config**

Baseline config:

- `appId: com.agenthub.desktop`
- `productName: AgentHub`
- Windows: `nsis`
- Linux: `AppImage` later
- macOS: `dmg` later
- include `dist/**`, `resources/web/**`, and package metadata
- unpack server assets if required for Node process startup

**Step 4: Verify package dry run**

```bash
pnpm -C apps/web build
pnpm -C apps/desktop build
pnpm -C apps/desktop package
pnpm exec node --test tests/desktop-packaging.test.mjs
```

Expected:

- package directory build succeeds
- no secrets bundled
- desktop can find web bundle path

**Step 5: Commit**

```bash
git add apps/desktop apps/web/next.config.js tests/desktop-packaging.test.mjs
git commit -m "build: package desktop shell with web bundle"
```

## Task 8: Updater Stability

**Files:**

- Create: `apps/desktop/src/main/updater.ts`
- Create: `apps/desktop/src/main/logging.ts`
- Create: `apps/desktop/dev-app-update.yml.example`
- Create: `.github/workflows/desktop-release.yml`
- Modify: `apps/desktop/electron-builder.yml`
- Modify: `apps/desktop/src/main/index.ts`
- Test: `tests/desktop-updater.test.mjs`

**Step 1: Write the failing test**

Assert:

- updater code is isolated in `updater.ts`
- updater does not run in development unless explicitly forced
- updater logs to desktop log file
- updater has `checking`, `available`, `not-available`, `downloaded`, and `error` state handling
- CI workflow builds desktop artifacts
- docs mention signing requirements

Run:

```bash
pnpm exec node --test tests/desktop-updater.test.mjs
```

Expected: FAIL.

**Step 2: Add updater module**

Rules:

- do not call update checks twice
- do not check immediately on Windows Squirrel first-run
- expose update state through read-only IPC later
- log every update transition
- allow channels: `stable`, `beta`, `nightly`

**Step 3: Choose publish provider**

Preferred first target:

- GitHub Releases for public/open releases
- generic HTTPS endpoint if releases must be private

Do not wire private update credentials into renderer code.

**Step 4: Add release workflow**

Workflow should:

1. run `pnpm install --frozen-lockfile`
2. run `pnpm typecheck`
3. run `pnpm test`
4. run `pnpm -C apps/web build`
5. run `pnpm -C apps/desktop dist`
6. upload artifacts and update metadata

Signing can be initially documented if certificates are not available, but production auto-update is not complete until signed builds work.

**Step 5: Verify updater**

Local dry run:

```bash
pnpm exec node --test tests/desktop-updater.test.mjs
pnpm -C apps/desktop package
```

Staging acceptance:

1. install version `0.1.0-beta.1`
2. publish `0.1.0-beta.2`
3. verify update is detected
4. verify download completes
5. verify app restarts into new version
6. verify rollback requires a higher semver patch

**Step 6: Commit**

```bash
git add apps/desktop .github/workflows/desktop-release.yml tests/desktop-updater.test.mjs
git commit -m "feat: add desktop updater foundation"
```

## Task 9: Local-Service Startup Stability

**Files:**

- Create: `apps/desktop/src/main/services/service-ledger.ts`
- Create: `apps/desktop/src/main/services/docker-compose.ts`
- Create: `apps/desktop/src/main/services/dependency-health.ts`
- Create: `apps/web/src/app/api/health/dependencies/route.ts`
- Create: `docs/desktop/local-services.md`
- Test: `tests/desktop-services.test.mjs`

**Step 1: Write the failing test**

Assert:

- service ledger lists web, database, redis, object storage, auth, search, ollama, lmstudio, vllm
- dependency health route checks database without exposing secrets
- Docker Compose orchestration is opt-in
- no code automatically kills port listeners
- service startup errors map to actionable user-facing states

Run:

```bash
pnpm exec node --test tests/desktop-services.test.mjs
```

Expected: FAIL.

**Step 2: Add service ledger**

Each service record:

```ts
type ServiceState = {
  id: "web" | "database" | "redis" | "objectStorage" | "auth" | "search" | "ollama" | "lmstudio" | "vllm";
  label: string;
  requiredFor: "launch" | "chat" | "files" | "automations" | "optional";
  configuredUrl?: string;
  status: "unknown" | "checking" | "healthy" | "unhealthy" | "not-configured";
  action?: "start-docker" | "open-settings" | "open-docs" | "retry";
};
```

**Step 3: Add dependency health route**

`/api/health/dependencies` should check:

- database query `select 1`
- Redis ping if `REDIS_URL` is configured
- MinIO/S3 bucket only if object storage env exists
- provider local endpoints with short timeouts

It must never return connection strings, keys, or secrets.

**Step 4: Add Docker Compose detection only**

First implementation:

- detect whether Docker CLI exists
- detect whether `docker compose ps` works in repo root
- detect container health state
- report "not running" with setup action

Do not auto-start Docker until the next task unless the user explicitly approves.

**Step 5: Add opt-in startup**

Second implementation:

- user clicks "Start local services"
- desktop runs `docker compose up -d postgresql redis minio minio-init`
- waits for health checks
- applies migrations only after database is healthy
- writes status to logs

Never start Casdoor automatically until auth mode is decided.

**Step 6: Verify**

```bash
pnpm exec node --test tests/desktop-services.test.mjs
pnpm -C apps/web typecheck
pnpm -C apps/desktop typecheck
pnpm test
```

Manual smoke:

```bash
docker compose ps
pnpm -C apps/desktop dev
```

Expected:

- desktop shows exact missing dependency
- app does not hang on missing Redis/MinIO
- app does not kill unrelated port listeners
- app logs include service startup decisions

**Step 7: Commit**

```bash
git add apps/desktop apps/web/src/app/api/health/dependencies/route.ts docs/desktop/local-services.md tests/desktop-services.test.mjs
git commit -m "feat: add desktop local service health ledger"
```

## Task 10: Keychain Capability, Still Disabled By Default

**Files:**

- Create: `apps/desktop/src/main/capabilities/keychain.ts`
- Modify: `apps/desktop/src/main/ipc.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Create: `docs/desktop/keychain.md`
- Test: `tests/desktop-keychain.test.mjs`

**Step 1: Write the failing test**

Assert:

- keychain API is behind `desktopRuntime.capabilities.keychain === true`
- renderer cannot enumerate arbitrary secrets
- secret keys are namespaced with `agenthub:`
- web-only runtime has no keychain path
- errors never include secret values

Run:

```bash
pnpm exec node --test tests/desktop-keychain.test.mjs
```

Expected: FAIL.

**Step 2: Choose storage backend**

Preferred order:

1. Electron `safeStorage` plus encrypted file under `userData` for desktop-only secrets.
2. OS keychain package only if `safeStorage` cannot satisfy the target use case.
3. Do not migrate existing database credentials automatically.

**Step 3: Add capability but keep UI disabled**

Expose only internal IPC for a small allowlist:

- `providerCredential:<providerId>`
- `mcpServer:<serverId>`

No arbitrary key read/write.

**Step 4: Verify**

```bash
pnpm exec node --test tests/desktop-keychain.test.mjs
pnpm -C apps/desktop typecheck
pnpm test
```

**Step 5: Commit**

```bash
git add apps/desktop docs/desktop/keychain.md tests/desktop-keychain.test.mjs
git commit -m "feat: add gated desktop keychain foundation"
```

## Task 11: Local File Snapshot Capability, Explicit User Intent Only

**Files:**

- Create: `apps/desktop/src/main/capabilities/file-snapshots.ts`
- Modify: `apps/desktop/src/main/ipc.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Create: `docs/desktop/file-access.md`
- Test: `tests/desktop-file-access.test.mjs`

**Step 1: Write the failing test**

Assert:

- files are selected through native dialog only
- no arbitrary path read IPC exists
- selected file size limit exists
- binary files are rejected or represented as metadata only
- every snapshot response includes original path, basename, size, mime guess, hash, and content preview

Run:

```bash
pnpm exec node --test tests/desktop-file-access.test.mjs
```

Expected: FAIL.

**Step 2: Implement read-only snapshots**

Rules:

- user gesture opens dialog
- max file size starts at 5 MB for text snapshots
- content is copied into app-owned data or sent to web upload flow
- original path is never persisted unless user opts in
- no write/delete/move operations

**Step 3: Wire to web only after shell stability**

Add a desktop-only button in chat attachment flow only if:

- `hasDesktopRuntime()` is true
- file snapshot capability is true
- user explicitly clicks the native file action

**Step 4: Verify**

```bash
pnpm exec node --test tests/desktop-file-access.test.mjs
pnpm -C apps/desktop typecheck
pnpm -C apps/web typecheck
pnpm test
```

**Step 5: Commit**

```bash
git add apps/desktop apps/web docs/desktop/file-access.md tests/desktop-file-access.test.mjs
git commit -m "feat: add guarded desktop file snapshots"
```

## Task 12: MCP STDIO And CLI Mounting Gate

**Files:**

- Create: `apps/desktop/src/main/capabilities/stdio-mcp.ts`
- Create: `apps/desktop/src/main/capabilities/cli-registry.ts`
- Modify: `apps/web/src/components/McpSettings.tsx`
- Modify: `apps/web/src/server/routers/mcp.ts`
- Create: `docs/desktop/stdio-mcp.md`
- Test: `tests/desktop-stdio-mcp.test.mjs`

**Step 1: Write the failing test**

Assert:

- STDIO MCP is unavailable in web-only runtime
- desktop capability requires explicit user approval
- command path is validated
- arguments are passed as arrays, never shell strings
- process lifecycle cleanup exists
- audit log records command, args hash, start, stop, and error state

Run:

```bash
pnpm exec node --test tests/desktop-stdio-mcp.test.mjs
```

Expected: FAIL.

**Step 2: Implement disabled-by-default capability**

Initial supported actions:

- validate command path
- start one configured MCP STDIO process
- list tools after JSON-RPC initialize
- stop process

Unsupported until later:

- arbitrary shell commands
- background daemon installs
- automatic CLI modifications
- filesystem-wide scans

**Step 3: Web UI integration**

`McpSettings.tsx` should:

- show "Desktop runtime required" for STDIO when web-only
- show explicit approval dialog in desktop
- keep HTTP MCP behavior unchanged

**Step 4: Verify**

```bash
pnpm exec node --test tests/desktop-stdio-mcp.test.mjs
pnpm -C apps/desktop typecheck
pnpm -C apps/web typecheck
pnpm test
```

**Step 5: Commit**

```bash
git add apps/desktop apps/web/src/components/McpSettings.tsx apps/web/src/server/routers/mcp.ts docs/desktop/stdio-mcp.md tests/desktop-stdio-mcp.test.mjs
git commit -m "feat: gate stdio mcp behind desktop runtime"
```

## Task 13: Desktop E2E Smoke Suite

**Files:**

- Create: `apps/desktop/tests/smoke/launch.spec.ts`
- Create: `apps/desktop/tests/smoke/auth.spec.ts`
- Create: `apps/desktop/tests/smoke/services.spec.ts`
- Create: `apps/desktop/playwright.config.ts`
- Modify: `apps/desktop/package.json`
- Test: `tests/desktop-e2e-config.test.mjs`

**Step 1: Write config test**

Assert:

- desktop Playwright config exists
- smoke tests cover launch, auth, and service state
- package has `test:e2e`

Run:

```bash
pnpm exec node --test tests/desktop-e2e-config.test.mjs
```

Expected: FAIL.

**Step 2: Add desktop smoke tests**

Minimum tests:

1. launches desktop shell
2. web health route returns ok
3. settings page renders
4. desktop runtime is detected
5. auth dev login works in dev mode
6. closing app leaves no owned child process

**Step 3: Add command**

After this task adds it:

```bash
pnpm -C apps/desktop test:e2e
```

**Step 4: Verify**

```bash
pnpm exec node --test tests/desktop-e2e-config.test.mjs
pnpm -C apps/desktop test:e2e
pnpm typecheck
pnpm test
```

**Step 5: Commit**

```bash
git add apps/desktop tests/desktop-e2e-config.test.mjs
git commit -m "test: add desktop smoke coverage"
```

## Final Stabilization Gates

Desktop shell is stable only when all of these pass:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm -C apps/desktop typecheck
pnpm -C apps/desktop test
pnpm -C apps/desktop test:e2e
pnpm -C apps/desktop package
git diff --check
```

Additional manual gates:

- Launch desktop 10 times in a row with no orphaned child processes.
- Launch while port 3000 is occupied and confirm desktop chooses another port.
- Launch with database down and confirm actionable error state, not a blank window.
- Sign in and sign out in development desktop mode.
- Package and run the unpacked app.
- Install a staging build, update it to a newer staging build, and verify version changes.
- Close the app during startup and verify no server process remains.

## Done-When Criteria By Stability Area

**Shell stable when:**

- desktop opens the existing web UI without a duplicate renderer implementation
- safe Electron defaults are enforced by source tests
- desktop can load a running dev web URL or launch its own local web server
- no desktop-only API exists in web-only runtime
- shutdown cleans up owned child processes

**Auth stable when:**

- `NEXTAUTH_URL` follows the selected local origin
- sign-in and sign-out work on a non-3000 port
- OAuth external navigation is controlled
- callback behavior is documented and covered by smoke tests

**Updater stable when:**

- packaged build includes update metadata
- updater logs state transitions
- update checks do not run twice
- staging channel can update an installed app
- signing requirements are documented and production builds are signed before real release

**Local-service startup stable when:**

- service ledger reports exact state for database, Redis, object storage, local models, auth, and search
- missing services produce actionable UI
- Docker Compose startup is opt-in
- migrations run only after database health passes
- no unrelated listener is killed automatically

## Recommended Execution Sequence

Execute tasks in order. Do not start native filesystem, STDIO MCP, or CLI mounting work until Tasks 1-9 are green.

Recommended batch boundaries:

1. Tasks 1-3: architecture, workspace, secure IPC.
2. Tasks 4-5: local web launch and web runtime detection.
3. Task 6: auth.
4. Tasks 7-8: packaging and updater.
5. Task 9: service health.
6. Tasks 10-12: native capabilities.
7. Task 13: desktop E2E.

Each batch should end with:

```bash
pnpm typecheck
pnpm test
pnpm build
git diff --check
```
