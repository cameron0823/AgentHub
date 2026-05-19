import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("auth docs describe the implemented NextAuth and Casdoor stack", async () => {
  const [docs, adr] = await Promise.all([readText("docs/auth.md"), readText("docs/adr/0003-auth-stack.md")]);

  for (const required of [
    "NextAuth + Casdoor",
    "DrizzleAdapter",
    "dev-credentials",
    "development only",
    "JWT sessions in development",
    "database sessions in production",
    "AUTH_CASDOOR_ISSUER",
    "AUTH_CASDOOR_ID",
    "AUTH_CASDOOR_SECRET",
    "NEXTAUTH_URL",
    "NEXTAUTH_SECRET",
    "users.role",
    "adminProcedure",
    "user",
    "admin",
  ]) {
    assert.match(docs, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `docs/auth.md missing ${required}`);
  }

  assert.match(docs, /Better Auth is not the current runtime auth implementation/);
  assert.match(docs, /magic links are not implemented/);
  assert.match(docs, /email\/password production login is not implemented/);
  assert.match(docs, /allowlists are not implemented/);
  assert.match(docs, /SSO-only mode is not implemented/);
  assert.match(docs, /0003-auth-stack/);

  assert.match(adr, /Accepted/);
  assert.match(adr, /NextAuth \+ Casdoor as the current runtime auth stack/);
  assert.match(adr, /Better Auth does not supersede the live implementation/);
  assert.match(adr, /explicitly out of scope/);
});

test("auth docs and env examples match the live NextAuth implementation", async () => {
  const [readme, envExample, authSource, routeSource, docs, casdoorSpec] = await Promise.all([
    readText("README.md"),
    readText(".env.example"),
    readText("apps/web/src/server/auth.ts"),
    readText("apps/web/src/app/api/auth/[...nextauth]/route.ts"),
    readText("docs/auth.md"),
    readText("apps/web/tests/e2e/specs/phase-h/casdoor-oauth.spec.ts"),
  ]);

  assert.match(readme, /docs\/auth\.md/);
  assert.match(authSource, /import NextAuth/);
  assert.match(authSource, /DrizzleAdapter/);
  assert.match(authSource, /CredentialsProvider/);
  assert.match(authSource, /\.\.\.\(\s*isDev\s*\?\s*\[\s*CredentialsProvider/);
  assert.match(authSource, /id: "casdoor"/);
  assert.match(authSource, /AUTH_CASDOOR_ISSUER/);
  assert.match(authSource, /AUTH_CASDOOR_ID/);
  assert.match(authSource, /AUTH_CASDOOR_SECRET/);
  assert.match(authSource, /strategy: isDev \? "jwt" : "database"/);
  assert.doesNotMatch(authSource, /better-auth/i);
  assert.match(routeSource, /export \{ GET, POST \}/);
  assert.match(docs, /local Casdoor OAuth proof/);
  assert.match(docs, /casdoor-oauth\.spec\.ts/);
  assert.match(casdoorSpec, /ensureE2ECasdoorOAuthApp/);
  assert.match(casdoorSpec, /storageState: undefined/, "Casdoor proof must not reuse dev-credentials auth state");
  assert.match(casdoorSpec, /\/api\/auth\/signin\?callbackUrl=\//, "Casdoor proof must start on the auth page");
  assert.match(casdoorSpec, /\/api\/auth\/signin\/casdoor/, "Casdoor proof must enter through the OIDC provider");
  assert.match(casdoorSpec, /csrfToken/, "Casdoor proof must use NextAuth CSRF-protected provider start");
  assert.match(casdoorSpec, /admin@example\.com/, "Casdoor proof must verify the Casdoor-backed session user");

  for (const envName of [
    "NEXTAUTH_URL",
    "NEXTAUTH_SECRET",
    "AUTH_CASDOOR_ISSUER",
    "AUTH_CASDOOR_ID",
    "AUTH_CASDOOR_SECRET",
  ]) {
    assert.match(envExample, new RegExp(`^${envName}=`, "m"), `.env.example missing ${envName}`);
  }
  assert.doesNotMatch(envExample, /^BETTER_AUTH_/m);
});

test("multi-user role gates remain enforced by admin procedures", async () => {
  const [schema, trpc, adminRouter, adminTests] = await Promise.all([
    readText("apps/web/src/server/db/schema.ts"),
    readText("apps/web/src/server/trpc.ts"),
    readText("apps/web/src/server/routers/admin.ts"),
    readText("tests/admin-panel.test.mjs"),
  ]);

  assert.match(schema, /role: text\(\s*\"role\"\)\.notNull\(\)\.default\("user"\)/);
  assert.match(trpc, /export const adminProcedure = authedProcedure/);
  assert.match(trpc, /role.*!== "admin"/);
  assert.match(adminRouter, /z\.enum\(\["user", "admin"\]\)/);
  assert.match(adminRouter, /users\.setRole|setRole: adminProcedure/);
  assert.match(adminTests, /admin router has users\.setRole mutation with role enum/);
  assert.match(adminTests, /Sidebar shows admin link only for admin users/);
});
