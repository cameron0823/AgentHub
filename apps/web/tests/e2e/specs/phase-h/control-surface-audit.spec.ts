import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import {
  createE2EAgent,
  createE2EDocument,
  createE2EKnowledgeBase,
  createE2EMcpServer,
  createE2EMemory,
  createE2ESessionWithMessages,
  getE2EUserId,
  uniqueName,
} from "../../fixtures";

const DEFAULT_DATABASE_URL = "postgres://agenthub:agenthub_password@localhost:5432/agenthub_e2e";
const sql = postgres(process.env.DATABASE_URL || DEFAULT_DATABASE_URL, { max: 2 });

const CONTROL_SELECTOR = [
  "button",
  "a[href]",
  "input:not([type='hidden'])",
  "textarea",
  "select",
  "[role='button']",
  "[role='tab']",
  "[role='switch']",
  "[role='menuitem']",
  "[role='combobox']",
].join(",");

const DATA_TESTID_SELECTOR = "[data-testid]";
const AUDIT_PREFIX = "e2e-audit";

type ControlMeta = {
  auditId: string;
  ordinal: number;
  kind: "button" | "link" | "input" | "textarea" | "select" | "role";
  tag: string;
  role: string | null;
  type: string | null;
  name: string;
  text: string;
  href: string | null;
  testId: string | null;
  disabled: boolean;
  readOnly: boolean;
  checked: boolean | null;
  ariaChecked: string | null;
  ariaExpanded: string | null;
  ariaSelected: string | null;
};

type SelectorMeta = {
  testId: string;
  tag: string;
  text: string;
  visible: boolean;
};

type InteractionRecord = {
  surface: string;
  control: string;
  kind: ControlMeta["kind"];
  action: "click" | "fill" | "select" | "toggle" | "skip";
  status: "passed" | "skipped" | "failed";
  durationMs?: number;
  reason?: string;
  response?: string[];
};

type SurfaceReport = {
  name: string;
  controlsSeen: number;
  selectorsSeen: number;
  interacted: number;
  skipped: number;
  failures: string[];
  interactions: InteractionRecord[];
  selectors: SelectorMeta[];
};

type Surface = {
  name: string;
  url: string;
  scopeSelector?: string;
  prepare?: (page: Page) => Promise<void>;
};

const surfaces: Surface[] = [
  { name: "home.chat", url: "/" },
  {
    name: "home.search-modal",
    url: "/",
    scopeSelector: "[role='dialog'][aria-label='Search conversations']",
    prepare: async (page) => {
      await expect(page.getByRole("button", { name: "New Chat", exact: true })).toBeVisible();
      await page.evaluate(() => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "k",
            code: "KeyK",
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
          }),
        );
      });
      await expect(page.getByRole("dialog", { name: /search conversations/i })).toBeVisible();
    },
  },
  {
    name: "home.agent-builder",
    url: "/",
    prepare: async (page) => {
      await page.getByRole("button", { name: /new agent/i }).click();
      await expect(page.getByRole("heading", { name: /new agent/i })).toBeVisible();
    },
  },
  {
    name: "home.group-builder",
    url: "/",
    prepare: async (page) => {
      await page.getByRole("button", { name: /new group/i }).click();
      await expect(page.getByRole("heading", { name: /new group/i })).toBeVisible();
    },
  },
  {
    name: "home.memory",
    url: "/",
    prepare: async (page) => {
      await page.getByRole("button", { name: /^memory$/i }).click();
      await expect(page.getByRole("heading", { name: /^memory$/i })).toBeVisible();
    },
  },
  {
    name: "home.marketplace",
    url: "/",
    prepare: async (page) => {
      await page.getByRole("button", { name: /marketplace/i }).click();
      await expect(page.getByTestId("catalog-grid")).toBeVisible();
    },
  },
  {
    name: "home.admin",
    url: "/",
    prepare: async (page) => {
      await page.getByRole("button", { name: /^admin$/i }).click();
      await expect(page.getByRole("heading", { name: /admin panel/i })).toBeVisible();
    },
  },
  { name: "settings", url: "/settings" },
  {
    name: "settings.mcp-add-form",
    url: "/settings",
    prepare: async (page) => {
      await page.getByRole("button", { name: /add server/i }).click();
      await expect(page.getByRole("heading", { name: /new mcp server/i })).toBeVisible();
    },
  },
  { name: "knowledge-base", url: "/kb" },
  {
    name: "knowledge-base.create-form",
    url: "/kb",
    prepare: async (page) => {
      await page.getByRole("button", { name: /new kb/i }).click();
      await expect(page.getByPlaceholder(/knowledge base name/i)).toBeVisible();
    },
  },
  { name: "tasks", url: "/tasks" },
  {
    name: "tasks.create-form",
    url: "/tasks",
    prepare: async (page) => {
      const titleInput = page.getByPlaceholder(/summarize the quarterly report/i);
      if (!(await titleInput.isVisible({ timeout: 500 }).catch(() => false))) {
        await page.getByRole("button", { name: /new task/i }).click();
      }
      await expect(titleInput).toBeVisible();
    },
  },
  {
    name: "tasks.expanded-row",
    url: "/tasks",
    prepare: async (page) => {
      await page
        .getByTitle(/expand/i)
        .first()
        .click();
      await expect(page.getByRole("button", { name: /reassign/i }).first()).toBeVisible();
    },
  },
  { name: "automations", url: "/automations" },
  {
    name: "automations.create-form",
    url: "/automations",
    prepare: async (page) => {
      await page.getByRole("button", { name: /new automation/i }).click();
      await expect(page.getByRole("heading", { name: /new automation/i })).toBeVisible();
    },
  },
  {
    name: "automations.run-history",
    url: "/automations",
    prepare: async (page) => {
      await page
        .getByTitle(/run history/i)
        .first()
        .click();
      await expect(page.getByText(/output \/ error/i)).toBeVisible();
    },
  },
  { name: "projects", url: "/projects" },
  { name: "pages", url: "/pages" },
  { name: "review", url: "/review" },
  { name: "analytics", url: "/analytics" },
  { name: "admin", url: "/admin" },
];

function normalize(text: string | null | undefined) {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function isKnownAsyncConsoleNoise(text: string) {
  return [
    /favicon/i,
    /_next\/webpack-hmr/i,
    /Download the React DevTools/i,
    /ResizeObserver loop/i,
    /\[next-auth\]\[error\]\[CLIENT_FETCH_ERROR\][\s\S]*Failed to fetch/i,
  ].some((pattern) => pattern.test(text));
}

function skipReason(control: ControlMeta) {
  if (control.disabled) return "disabled control";
  if (control.readOnly) return "read-only control";

  const label = `${control.name} ${control.text} ${control.href ?? ""} ${control.testId ?? ""}`.toLowerCase();

  if (control.type === "file") return "native file picker requires a local file fixture";
  if (control.kind === "link") return "navigation link covered by the direct route surfaces";

  const mutatingOrServiceBound = [
    /\bnew agent\b|\bnew group\b|\bmemory\b|\bmarketplace\b|\badmin\b/,
    /\bcollapse sidebar\b|\bexpand sidebar\b/,
    /sign out|log out/,
    /\bdelete\b|\bremove\b|revoke admin|make admin/,
    /\binstall\b|\bupdate\b|\bfork\b/,
    /\bupload\b|\bdownload\b|\bexport\b|\bimport\b/,
    /\bsend message\b|\bstop generation\b|\battach file\b|\bvoice\b|\brecord\b|\bmicrophone\b/,
    /\brun\b|\bstart test run\b|\btest connection\b|\brefresh brief\b|\bdraft\b|\bdelegate\b/,
    /\bapprove\b|\breject\b|\bregister repository\b/,
    /\blink resource\b|\badd notebook doc\b|\badd comment\b|\bapply\b|\brestore\b|\brewrite\b/,
    /\bsave\b|\bcreate\b|\badding\b/,
    /\bnew chat\b|\bnew page\b|\bnew project\b/,
    /\benable\b|\bdisable\b|\bpause\b|\bresume\b|\bretry\b|\bcancel\b/,
  ];

  return mutatingOrServiceBound.some((pattern) => pattern.test(label))
    ? "persistent mutation, native picker, external navigation, or service-bound action"
    : null;
}

async function cleanupAuditData() {
  await sql`delete from automation_runs where automation_id in (select id from automations where name like 'E2E Audit %')`;
  await sql`delete from automations where name like 'E2E Audit %'`;

  await sql`delete from agent_task_comments where task_id in (select id from agent_tasks where title like 'E2E Audit %')`;
  await sql`delete from agent_tasks where title like 'E2E Audit %'`;
  await sql`delete from agent_task_templates where name like 'E2E Audit %'`;

  await sql`delete from project_notebook_documents where title like 'E2E Audit %'`;
  await sql`delete from projects where name like 'E2E Audit %'`;

  await sql`delete from page_agent_edits where page_id in (select id from pages where title like 'E2E Audit %')`;
  await sql`delete from page_comments where page_id in (select id from pages where title like 'E2E Audit %')`;
  await sql`delete from page_versions where page_id in (select id from pages where title like 'E2E Audit %')`;
  await sql`delete from pages where title like 'E2E Audit %'`;

  await sql`delete from group_members where group_id in (select id from agent_groups where name like 'E2E Audit %')`;
  await sql`delete from agent_groups where name like 'E2E Audit %'`;
}

async function seedAuditData() {
  await cleanupAuditData();

  const userId = await getE2EUserId();
  await sql`update users set role = 'admin' where id = ${userId}`;
  const agent = await createE2EAgent(uniqueName("E2E Audit Agent"));
  await createE2ESessionWithMessages(uniqueName("E2E Audit Chat"));
  const kb = await createE2EKnowledgeBase(uniqueName("E2E Audit KB"));
  await createE2EDocument(kb.id, `${uniqueName("E2E Audit Doc")}.md`);
  await createE2EMemory(uniqueName("E2E Audit Accepted Memory"), "accepted");
  await createE2EMemory(uniqueName("E2E Audit Proposed Memory"), "proposed");
  await createE2EMcpServer(uniqueName("E2E Audit MCP Server"));

  const group = await sql<{ id: string }[]>`
    insert into agent_groups (user_id, name, description, pattern)
    values (${userId}, ${uniqueName("E2E Audit Group")}, 'Control surface audit group', 'sequential')
    returning id
  `;
  await sql`
    insert into group_members (group_id, agent_id, role, sort_order)
    values (${group[0].id}, ${agent.id}, 'reviewer', 0)
  `;

  const page = await sql<{ id: string }[]>`
    insert into pages (user_id, title, markdown, plain_text)
    values (${userId}, ${uniqueName("E2E Audit Page")}, '# Audit page\n\nEditable content.', 'Audit page Editable content.')
    returning id
  `;
  await sql`
    insert into page_versions (page_id, user_id, version_number, title, markdown, plain_text, source_type)
    values
      (${page[0].id}, ${userId}, 1, 'E2E Audit Page v1', '# Audit page v1', 'Audit page v1', 'human'),
      (${page[0].id}, ${userId}, 2, 'E2E Audit Page v2', '# Audit page v2', 'Audit page v2', 'agent')
  `;
  await sql`
    insert into page_comments (page_id, user_id, author_type, body)
    values (${page[0].id}, ${userId}, 'human', 'E2E Audit page comment')
  `;

  const project = await sql<{ id: string }[]>`
    insert into projects (user_id, name, description)
    values (${userId}, ${uniqueName("E2E Audit Project")}, 'Control surface audit project')
    returning id
  `;
  await sql`
    insert into project_notebook_documents (project_id, user_id, title, content, source_type)
    values (${project[0].id}, ${userId}, ${uniqueName("E2E Audit Notebook")}, 'Notebook content for control audit.', 'note')
  `;
  await sql`
    insert into project_agents (project_id, user_id, agent_id)
    values (${project[0].id}, ${userId}, ${agent.id})
    on conflict do nothing
  `;

  const template = await sql<{ id: string }[]>`
    insert into agent_task_templates (user_id, agent_id, name, title, prompt)
    values (${userId}, ${agent.id}, ${uniqueName("E2E Audit Template")}, 'E2E Audit templated task', 'Use this task to audit selectors.')
    returning id
  `;
  const task = await sql<{ id: string }[]>`
    insert into agent_tasks (user_id, agent_id, template_id, assigned_by_user_id, title, prompt, status, output, priority)
    values (${userId}, ${agent.id}, ${template[0].id}, ${userId}, ${uniqueName("E2E Audit Task")}, 'Audit row controls.', 'error', 'Synthetic task output.', 1)
    returning id
  `;
  await sql`
    insert into agent_task_comments (task_id, user_id, author_type, body)
    values (${task[0].id}, ${userId}, 'human', 'E2E Audit task comment')
  `;

  const automation = await sql<{ id: string }[]>`
    insert into automations (user_id, agent_id, name, prompt, cron_expression, timezone, is_active, last_run_at)
    values (${userId}, ${agent.id}, ${uniqueName("E2E Audit Automation")}, 'Audit automation controls.', '0 9 * * *', 'UTC', true, now())
    returning id
  `;
  await sql`
    insert into automation_runs (automation_id, status, output, notification_status, started_at, completed_at)
    values (${automation[0].id}, 'success', 'E2E Audit automation output', 'skipped', now() - interval '2 minutes', now() - interval '1 minute')
  `;
}

async function refreshDevAdminSession(page: Page) {
  await page.goto("/api/auth/signin?callbackUrl=/", { waitUntil: "domcontentloaded" });
  const devLogin = page.getByRole("button", { name: /sign in with dev login/i });
  if (await devLogin.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await page.fill('input[name="email"]', "admin@localhost");
    await page.fill('input[name="password"]', "admin12345");
    await devLogin.click();
    await page.waitForURL("/");
  } else {
    await page.goto("/", { waitUntil: "domcontentloaded" });
  }
}

async function openSurface(page: Page, surface: Surface) {
  await page.addInitScript(() => {
    localStorage.removeItem("sidebar-collapsed");
  });
  await page.setViewportSize({ width: 1440, height: 1050 });
  try {
    await page.goto(surface.url, { waitUntil: "domcontentloaded" });
  } catch (error) {
    if (!(error instanceof Error) || !/ERR_ABORTED|frame was detached/i.test(error.message)) {
      throw error;
    }
    await page.waitForTimeout(750);
    await page.goto(surface.url, { waitUntil: "domcontentloaded" });
  }
  await page.evaluate(() => localStorage.removeItem("sidebar-collapsed"));
  await page.waitForTimeout(250);
  await surface.prepare?.(page);
  await page.waitForTimeout(250);
  await expect(page.locator("body")).toContainText(/\S/);
}

async function collectControls(page: Page, surfaceName: string, scopeSelector?: string): Promise<ControlMeta[]> {
  return page.evaluate(
    ({ controlSelector, surface, scope }) => {
      function visible(el: Element) {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      }
      function labelText(el: Element) {
        const id = el.getAttribute("id");
        const labelledBy = el.getAttribute("aria-labelledby");
        const labels = [
          el.getAttribute("aria-label"),
          labelledBy
            ? labelledBy
                .split(/\s+/)
                .map((labelId) => document.getElementById(labelId)?.textContent ?? "")
                .join(" ")
            : "",
          id ? (document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent ?? "") : "",
          el.closest("label")?.textContent ?? "",
          el.getAttribute("title"),
          el.getAttribute("placeholder"),
          el.getAttribute("name"),
          el.getAttribute("data-testid"),
          el.textContent,
        ];
        return labels.map((entry) => (entry ?? "").replace(/\s+/g, " ").trim()).find(Boolean) ?? "";
      }
      function kind(el: Element): ControlMeta["kind"] {
        const tag = el.tagName.toLowerCase();
        if (tag === "a") return "link";
        if (tag === "input") return "input";
        if (tag === "textarea") return "textarea";
        if (tag === "select") return "select";
        if (tag === "button") return "button";
        return "role";
      }
      const root = scope ? document.querySelector(scope) : document;
      const elements = root
        ? (Array.from(new Set(Array.from(root.querySelectorAll(controlSelector)))) as HTMLElement[])
        : [];
      return elements.filter(visible).map((el, ordinal) => {
        const auditId = `${surface}-${ordinal}`;
        el.setAttribute("data-e2e-audit-id", auditId);
        const input = el instanceof HTMLInputElement ? el : null;
        const select = el instanceof HTMLSelectElement ? el : null;
        const textarea = el instanceof HTMLTextAreaElement ? el : null;
        return {
          auditId,
          ordinal,
          kind: kind(el),
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute("role"),
          type: input?.type ?? null,
          name: labelText(el),
          text: (el.textContent ?? "").replace(/\s+/g, " ").trim(),
          href: el instanceof HTMLAnchorElement ? el.getAttribute("href") : null,
          testId: el.getAttribute("data-testid"),
          disabled: Boolean(
            input?.disabled ??
            select?.disabled ??
            textarea?.disabled ??
            (el as HTMLButtonElement).disabled ??
            el.getAttribute("aria-disabled") === "true",
          ),
          readOnly: Boolean(input?.readOnly ?? textarea?.readOnly ?? false),
          checked: input && ["checkbox", "radio"].includes(input.type) ? input.checked : null,
          ariaChecked: el.getAttribute("aria-checked"),
          ariaExpanded: el.getAttribute("aria-expanded"),
          ariaSelected: el.getAttribute("aria-selected"),
        };
      });
    },
    {
      controlSelector: CONTROL_SELECTOR,
      surface: `${AUDIT_PREFIX}-${surfaceName.replace(/[^a-z0-9]+/gi, "-")}`,
      scope: scopeSelector,
    },
  );
}

async function collectSelectors(page: Page, scopeSelector?: string): Promise<SelectorMeta[]> {
  return page.evaluate(
    ({ selector, scope }) => {
      function visible(el: Element) {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      }
      const root = scope ? document.querySelector(scope) : document;
      return (root ? Array.from(root.querySelectorAll(selector)) : []).map((el) => ({
        testId: el.getAttribute("data-testid") ?? "",
        tag: el.tagName.toLowerCase(),
        text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
        visible: visible(el),
      }));
    },
    { selector: DATA_TESTID_SELECTOR, scope: scopeSelector },
  );
}

async function dismissTransientOverlays(page: Page) {
  await page.keyboard.press("Escape").catch(() => undefined);
  await page
    .locator('[data-testid="workspace-menu"]')
    .waitFor({ state: "hidden", timeout: 500 })
    .catch(() => undefined);
}

async function interactWithControl(page: Page, surface: Surface, control: ControlMeta): Promise<InteractionRecord> {
  const skipped = skipReason(control);
  if (skipped) {
    return {
      surface: surface.name,
      control: control.name || control.testId || `${control.tag}[${control.ordinal}]`,
      kind: control.kind,
      action: "skip",
      status: "skipped",
      reason: skipped,
    };
  }

  const locator = page.locator(`[data-e2e-audit-id="${control.auditId}"]`);
  if (!(await locator.isVisible({ timeout: 500 }).catch(() => false))) {
    return {
      surface: surface.name,
      control: control.name || control.testId || `${control.tag}[${control.ordinal}]`,
      kind: control.kind,
      action: "skip",
      status: "skipped",
      reason: "control no longer visible after earlier surface interaction",
    };
  }

  const started = Date.now();
  const beforeUrl = page.url();
  const beforeBody = normalize(await page.locator("body").innerText()).slice(0, 1_000);
  const beforeExpanded = await locator.getAttribute("aria-expanded").catch(() => null);
  const beforeChecked = await locator
    .evaluate((el) => {
      if (el instanceof HTMLInputElement && ["checkbox", "radio"].includes(el.type)) return String(el.checked);
      return el.getAttribute("aria-checked");
    })
    .catch(() => null);

  try {
    if (control.kind === "input" || control.kind === "textarea") {
      if (control.type === "checkbox" || control.type === "radio" || control.role === "switch") {
        await locator.click({ timeout: 5_000 });
      } else if (control.type === "range") {
        await locator.press("ArrowRight");
      } else if (control.type === "number") {
        const value = await locator.evaluate((el) => {
          const input = el as HTMLInputElement;
          const min = input.min ? Number(input.min) : 1;
          const max = input.max ? Number(input.max) : min + 1;
          const next = Number.isFinite(min) ? Math.min(max, Math.max(min, min + 1)) : 1;
          return String(next);
        });
        await locator.fill(value);
        await expect(locator).toHaveValue(value);
      } else {
        await locator.fill(`audit-${surface.name}`);
        await expect(locator).toHaveValue(/audit-/);
      }
    } else if (control.kind === "select") {
      const selected = await locator.evaluate((el) => {
        const select = el as HTMLSelectElement;
        const options = Array.from(select.options).filter((option) => !option.disabled);
        const current = select.value;
        const next = options.find((option) => option.value !== current) ?? options[0];
        if (!next) return null;
        select.value = next.value;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return next.value;
      });
      if (selected) await expect(locator).toHaveValue(selected);
    } else {
      await locator.click({ timeout: 5_000 });
    }

    await page.waitForTimeout(75);
    await expect(page.locator("body")).toContainText(/\S/);
    expect(page.url()).not.toMatch(/\/api\/auth\/signin/);

    const response: string[] = [];
    if (page.url() !== beforeUrl) response.push("url changed");
    const afterBody = normalize(await page.locator("body").innerText()).slice(0, 1_000);
    if (afterBody !== beforeBody) response.push("body changed");
    const afterExpanded = await locator.getAttribute("aria-expanded", { timeout: 250 }).catch(() => null);
    if (afterExpanded !== beforeExpanded) response.push("aria-expanded changed");
    const afterChecked = await locator
      .evaluate(
        (el) => {
          if (el instanceof HTMLInputElement && ["checkbox", "radio"].includes(el.type)) return String(el.checked);
          return el.getAttribute("aria-checked");
        },
        undefined,
        { timeout: 250 },
      )
      .catch(() => null);
    if (afterChecked !== beforeChecked) response.push("checked state changed");

    await dismissTransientOverlays(page);

    return {
      surface: surface.name,
      control: control.name || control.testId || `${control.tag}[${control.ordinal}]`,
      kind: control.kind,
      action:
        control.kind === "input" || control.kind === "textarea"
          ? control.type === "checkbox" || control.type === "radio" || control.role === "switch"
            ? "toggle"
            : "fill"
          : control.kind === "select"
            ? "select"
            : "click",
      status: "passed",
      durationMs: Date.now() - started,
      response: response.length ? response : ["click/focus completed and app remained healthy"],
    };
  } catch (error) {
    return {
      surface: surface.name,
      control: control.name || control.testId || `${control.tag}[${control.ordinal}]`,
      kind: control.kind,
      action:
        control.kind === "select"
          ? "select"
          : control.kind === "input" || control.kind === "textarea"
            ? "fill"
            : "click",
      status: "failed",
      durationMs: Date.now() - started,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

test.describe("AgentHub control surface audit", () => {
  test.setTimeout(5 * 60 * 1_000);

  test.afterAll(async () => {
    await cleanupAuditData();
    await sql.end();
  });

  test("visible buttons, selectors, and form controls respond without UI errors", async ({ page }) => {
    await seedAuditData();
    await refreshDevAdminSession(page);

    const consoleErrors: string[] = [];
    let dialogsDismissed = 0;
    let popupsClosed = 0;
    page.on("console", (msg) => {
      if (msg.type() === "error" && !isKnownAsyncConsoleNoise(msg.text())) {
        consoleErrors.push(msg.text());
      }
    });
    page.on("pageerror", (error) => {
      if (!isKnownAsyncConsoleNoise(error.message)) consoleErrors.push(error.message);
    });
    page.on("response", (response) => {
      if (response.status() >= 500) consoleErrors.push(`HTTP ${response.status()} ${response.url()}`);
    });
    page.on("dialog", async (dialog) => {
      dialogsDismissed += 1;
      await dialog.dismiss();
    });
    page.on("popup", async (popup) => {
      popupsClosed += 1;
      await popup.close();
    });

    const reports: SurfaceReport[] = [];

    for (const surface of surfaces) {
      await openSurface(page, surface);
      const selectors = (await collectSelectors(page, surface.scopeSelector)).filter((selector) => selector.visible);
      const controls = await collectControls(page, surface.name, surface.scopeSelector);
      const interactions: InteractionRecord[] = [];

      for (const control of controls) {
        interactions.push(await interactWithControl(page, surface, control));
      }

      reports.push({
        name: surface.name,
        controlsSeen: controls.length,
        selectorsSeen: selectors.length,
        interacted: interactions.filter((entry) => entry.status === "passed").length,
        skipped: interactions.filter((entry) => entry.status === "skipped").length,
        failures: interactions
          .filter((entry) => entry.status === "failed")
          .map((entry) => `${entry.control}: ${entry.reason}`),
        interactions,
        selectors,
      });
    }

    const failures = reports.flatMap((report) => report.failures.map((failure) => `${report.name} -> ${failure}`));
    const totalControls = reports.reduce((sum, report) => sum + report.controlsSeen, 0);
    const totalSelectors = reports.reduce((sum, report) => sum + report.selectorsSeen, 0);
    const totalInteracted = reports.reduce((sum, report) => sum + report.interacted, 0);
    const slowInteractions = reports.flatMap((report) =>
      report.interactions.filter((entry) => entry.status === "passed" && (entry.durationMs ?? 0) > 5_000),
    );

    const reportPath = path.resolve(process.cwd(), "../../test-results/control-surface-audit.json");
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(
      reportPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          totals: {
            surfaces: reports.length,
            controlsSeen: totalControls,
            selectorsSeen: totalSelectors,
            interacted: totalInteracted,
            skipped: reports.reduce((sum, report) => sum + report.skipped, 0),
            dialogsDismissed,
            popupsClosed,
          },
          slowInteractions,
          consoleErrors,
          reports,
        },
        null,
        2,
      ),
    );

    expect(totalControls, "the audit should discover rendered controls").toBeGreaterThan(0);
    expect(totalSelectors, "the audit should discover rendered data-testid selectors").toBeGreaterThan(0);
    expect(totalInteracted, "the audit should interact with safe controls").toBeGreaterThan(0);
    expect(failures, "control interaction failures").toEqual([]);
    expect(consoleErrors, "browser console/page errors").toEqual([]);
    expect(slowInteractions, "controls taking longer than 5s to respond").toEqual([]);
  });
});
