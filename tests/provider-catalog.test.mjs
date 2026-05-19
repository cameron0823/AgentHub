import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const readText = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("provider catalog defines LobeHub parity providers and exported factory helpers", async () => {
  const [catalog, factories, index] = await Promise.all([
    readText("packages/ai-providers/src/catalog.ts"),
    readText("packages/ai-providers/src/factories.ts"),
    readText("packages/ai-providers/src/index.ts"),
  ]);

  for (const providerId of [
    "ollama",
    "lmstudio",
    "vllm",
    "openai",
    "anthropic",
    "gemini",
    "moonshot",
    "github-copilot",
    "azure-openai",
    "aws-bedrock",
    "openrouter",
    "together",
    "groq",
    "fireworks",
    "deepseek",
    "qwen",
    "zhipu",
    "huggingface",
    "xai",
    "perplexity",
    "vercel-ai-gateway",
    "newapi",
    "aihubmix",
  ]) {
    assert.match(catalog, new RegExp(`id: "${providerId}"`), `missing catalog provider: ${providerId}`);
  }

  assert.match(catalog, /factory:\s*"openai-compatible"/);
  assert.match(catalog, /baseUrlMode:\s*"required"/);
  assert.match(factories, /createProviderFromCatalogCredential/);
  assert.match(factories, /OpenAICompatibleProvider/);
  assert.match(index, /export \* from "\.\/catalog"/);
  assert.match(index, /export \* from "\.\/factories"/);
});

test("provider registry and settings consume catalog metadata", async () => {
  const [registry, router, settings, providers, openaiCompatible, copilot] = await Promise.all([
    readText("packages/ai-providers/src/registry.ts"),
    readText("apps/web/src/server/routers/providers.ts"),
    readText("apps/web/src/components/ProviderSettings.tsx"),
    readText("apps/web/src/components/Providers.tsx"),
    readText("packages/ai-providers/src/providers/openai-compatible.ts"),
    readText("packages/ai-providers/src/providers/github-copilot.ts"),
  ]);

  assert.match(registry, /createProviderFromCatalogCredential/);
  assert.match(registry, /isPaidPlanRequired/);
  assert.match(registry, /checkProviderPlanAccess/);
  assert.match(router, /providerCatalog/);
  assert.match(router, /credentialsAllowedForPlan/);
  assert.match(router, /assertProviderPlanAccess/);
  assert.match(router, /planAccessible: gate\.allowed/);
  assert.match(router, /metadata:\s*getProviderCatalogEntry/);
  assert.match(settings, /trpc\.providers\.catalog\.useQuery/);
  assert.match(settings, /trpc\.quotas\.current\.useQuery/);
  assert.match(settings, /ProviderPlanGateCard/);
  assert.match(settings, /Requires Pro plan/);
  assert.match(settings, /GoogleGeminiOAuthCard/);
  assert.match(settings, /GitHubCopilotCard/);
  assert.match(providers, /maxItems:\s*1/);
  assert.match(registry, /Promise\.all\(\s*this\.list\(\)\.map/s);
  assert.doesNotMatch(settings, /const CLOUD_PROVIDERS/);
  assert.match(openaiCompatible, /Authorization:\s*`Bearer \$\{this\.apiKey\}`/);
  assert.match(openaiCompatible, /readonly type:\s*"local" \| "cloud"/);
  assert.match(copilot, /type\s*=\s*"cloud"/);
});

test("provider OAuth docs, env, and routes match the implemented credential flows", async () => {
  const [docs, envExample, envValidator, githubDevice, githubPoll, googleInitiate, googleCallback, geminiProvider] =
    await Promise.all([
      readText("docs/PROVIDER_AUTH.md"),
      readText(".env.example"),
      readText("scripts/validate-env.mjs"),
      readText("apps/web/src/app/api/oauth/github-copilot/device/route.ts"),
      readText("apps/web/src/app/api/oauth/github-copilot/poll/route.ts"),
      readText("apps/web/src/app/api/oauth/google/initiate/route.ts"),
      readText("apps/web/src/app/api/oauth/google/callback/route.ts"),
      readText("packages/ai-providers/src/providers/gemini.ts"),
    ]);

  assert.match(docs, /Status.*Implemented/);
  assert.doesNotMatch(docs, /no code changes made yet/i);
  assert.match(docs, /\/api\/oauth\/github-copilot\/device/);
  assert.match(docs, /\/api\/oauth\/github-copilot\/poll/);
  assert.match(docs, /\/api\/oauth\/google\/initiate/);
  assert.match(docs, /\/api\/oauth\/google\/callback/);
  assert.match(docs, /GOOGLE_CLIENT_ID=/);
  assert.match(docs, /GOOGLE_CLIENT_SECRET=/);
  assert.doesNotMatch(docs, /GOOGLE_OAUTH_CLIENT_ID=/);

  for (const envName of ["GITHUB_COPILOT_CLIENT_ID", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]) {
    assert.match(envExample, new RegExp(`^${envName}=`, "m"), `.env.example missing ${envName}`);
    assert.match(
      envValidator,
      new RegExp(`${envName}: optionalString\\.optional\\(\\)`),
      `env validator missing ${envName}`,
    );
  }

  assert.match(githubDevice, /checkProviderPlanAccess\("github-copilot"/);
  assert.match(githubDevice, /github\.com\/login\/device\/code/);
  assert.match(githubPoll, /github\.com\/login\/oauth\/access_token/);
  assert.match(githubPoll, /authType:\s*"oauth"/);
  assert.match(googleInitiate, /checkProviderPlanAccess\("gemini"/);
  assert.match(googleInitiate, /GOOGLE_CLIENT_ID/);
  assert.match(googleInitiate, /code_challenge_method.*S256/s);
  assert.match(googleInitiate, /google_oauth_state/);
  assert.match(googleCallback, /GOOGLE_CLIENT_SECRET/);
  assert.match(googleCallback, /State mismatch/);
  assert.match(googleCallback, /authType:\s*"oauth"/);
  assert.match(geminiProvider, /this\.authType === "oauth"/);
});
