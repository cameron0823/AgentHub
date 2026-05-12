# Provider Authentication Design

> **Status**: Design document — no code changes made yet  
> **Last updated**: 2026-05-12  
> **Related**: `FEATURE_TRACKER.md §2`, `apps/web/src/components/ProviderSettings.tsx`

---

## 1. Reality Check: What "Subscription" Actually Means per Provider

This is the most important table in this document. Claude Max, ChatGPT Plus, and similar
consumer subscriptions do **not** grant programmatic API access. They are separate billing
products. Getting this wrong will result in broken UX and user frustration.

| Provider | Subscription | API Access? | Auth Method for API | Notes |
|----------|-------------|-------------|---------------------|-------|
| **Anthropic** | Claude Max ($20–$200/mo) | ❌ No | API key (separate billing via console.anthropic.com) | Claude Max = claude.ai UI only. API has its own usage-based pricing. |
| **OpenAI** | ChatGPT Plus/Team ($20–$30/mo) | ❌ No | API key (separate billing via platform.openai.com) | "Codex" subscription = GitHub Copilot, not OpenAI API directly. |
| **GitHub Copilot** | Individual/Business ($10–$19/mo) | ✅ Yes | OAuth device flow (real token) | Exposes an OpenAI-compatible endpoint. Device flow is the correct implementation. |
| **Google Gemini** | Gemini Advanced ($20/mo) | ❌ No | API key via AI Studio OR OAuth 2.0 via GCP project | Gemini Advanced = Gemini app only. API access requires GCP project + billing enabled. AI Studio gives free API keys for testing. |
| **Ollama** | Free / self-hosted | ✅ Yes | No auth (local URL) | Full control; no subscription required. |
| **LM Studio** | Free / self-hosted | ✅ Yes | No auth (local URL) | OpenAI-compatible local server. |
| **vLLM** | Self-hosted | ✅ Yes | Optional Bearer token | Typically run internally; configure base URL. |
| **Moonshot** | API pricing | ✅ Yes | API key | Standard key-based auth. |

### User-facing messaging guidelines

When a user enters provider settings, clearly communicate:

- **Anthropic**: "Requires a separate API key from console.anthropic.com — your Claude Max subscription does not include API access."
- **OpenAI**: "Requires a separate API key from platform.openai.com — your ChatGPT subscription does not include API access."
- **GitHub Copilot**: "Sign in with GitHub to use your Copilot subscription directly."
- **Gemini**: "Requires a Google AI Studio API key (free tier available) or a GCP-enabled OAuth token — Gemini Advanced does not include API access."

---

## 2. Current State

The `providerCredentials` DB table already supports OAuth. No migration required.

```typescript
// apps/web/src/server/db/schema.ts (existing columns)
export const providerCredentials = pgTable("provider_credentials", {
  authType:     text("auth_type").notNull().default("api_key"), // "api_key" | "oauth"
  apiKey:       text("api_key"),
  baseUrl:      text("base_url"),
  accessToken:  text("access_token"),    // OAuth access token
  refreshToken: text("refresh_token"),   // OAuth refresh token
  expiresAt:    timestamp("expires_at"), // Token expiry
  scope:        text("scope"),           // OAuth scopes granted
});
```

**What is missing:**
- No OAuth flow routes (`/api/auth/oauth/[provider]/...`)
- No token refresh logic
- No device flow implementation
- `ProviderSettings.tsx` shows only 4 hardcoded providers, all API-key only
- No UI guidance about subscription vs API key distinction
- Models are hardcoded — no dynamic fetch from provider's `/v1/models`

---

## 3. Recommended Implementation: GitHub Copilot (Device Flow)

GitHub Copilot is the only major subscription that exposes a real, documented API via
OAuth device flow. This is the highest-value OAuth integration to implement first.

### 3.1 Device Flow Overview

```
1. POST https://github.com/login/device/code
   → returns { device_code, user_code, verification_uri, expires_in, interval }

2. Show user_code + verification_uri in UI ("Go to github.com/login/device, enter: ABCD-1234")

3. Poll POST https://github.com/login/oauth/access_token every `interval` seconds
   → returns { access_token, token_type, scope } when user completes browser step

4. Store access_token in providerCredentials (authType="oauth")

5. Use token against GitHub's OpenAI-compatible endpoint:
   POST https://api.githubcopilot.com/chat/completions
   Authorization: Bearer <access_token>
   Editor-Version: AgentHub/1.0
```

### 3.2 Files to Create/Modify

**New files:**
```
apps/web/src/app/api/oauth/github-copilot/device/route.ts
  → POST: initiate device flow (calls GitHub, returns device_code + user_code)

apps/web/src/app/api/oauth/github-copilot/poll/route.ts
  → POST: poll for token completion; on success, upsert providerCredentials

packages/ai-providers/src/providers/github-copilot.ts
  → OAI-compatible provider using githubcopilot base URL + token auth
```

**Modified files:**
```
apps/web/src/server/routers/_app.ts (or future providers.ts sub-router)
  → Add providerCredentials.refreshToken procedure

apps/web/src/components/ProviderSettings.tsx
  → Add "Sign in with GitHub" button for Copilot
  → Show device flow modal (user_code + verification_uri + countdown)
  → Poll /api/oauth/github-copilot/poll until complete

packages/ai-providers/src/registry.ts
  → Register github-copilot provider when authType="oauth" token exists
```

### 3.3 GitHub Copilot Provider Implementation Sketch

```typescript
// packages/ai-providers/src/providers/github-copilot.ts
export class GitHubCopilotProvider implements AIProvider {
  readonly id = "github-copilot";
  readonly name = "GitHub Copilot";
  readonly baseUrl = "https://api.githubcopilot.com";

  async streamChat(messages, options, accessToken) {
    // OpenAI-compatible endpoint — reuse OpenAI provider logic with different base URL + headers
    return openAICompatibleStream(messages, options, {
      baseUrl: this.baseUrl,
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Editor-Version": "AgentHub/1.0",
        "Copilot-Integration-Id": "vscode-chat",
      }
    });
  }

  getModels() {
    // Copilot exposes: gpt-4o, gpt-4o-mini, claude-3.5-sonnet, o1, o3-mini
    return ["gpt-4o", "gpt-4o-mini", "claude-3.5-sonnet", "o1", "o3-mini"];
  }
}
```

### 3.4 Token Refresh

GitHub Copilot tokens expire. Add token refresh before each request:

```typescript
// Pseudo-code in registry.ts loadUserCredentials()
if (cred.authType === "oauth" && cred.expiresAt && cred.expiresAt < new Date()) {
  const refreshed = await refreshOAuthToken(cred.providerId, cred.refreshToken);
  await db.update(providerCredentials).set({
    accessToken: refreshed.access_token,
    expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
  }).where(eq(providerCredentials.id, cred.id));
}
```

---

## 4. Google Gemini OAuth (GCP)

Gemini Advanced does **not** grant API access. However, users with a GCP project can
authenticate via OAuth 2.0 to access the Gemini API with their GCP billing account.

### When to offer this

Only offer GCP OAuth when a user:
1. Already has a GCP project with Gemini API enabled
2. Wants to use GCP billing instead of AI Studio keys

For most users, a free AI Studio API key (`aistudio.google.com/apikey`) is simpler and should be the default path.

### OAuth 2.0 Flow (Authorization Code + PKCE)

```
1. GET https://accounts.google.com/o/oauth2/v2/auth
   ?client_id=<GOOGLE_CLIENT_ID>
   &redirect_uri=<APP_URL>/api/oauth/google/callback
   &scope=https://www.googleapis.com/auth/generative-language
   &response_type=code
   &code_challenge=<PKCE_CHALLENGE>
   &code_challenge_method=S256

2. User approves in Google → redirected to callback with ?code=...

3. POST https://oauth2.googleapis.com/token
   → { access_token, refresh_token, expires_in }

4. Store in providerCredentials (authType="oauth")

5. Use against: https://generativelanguage.googleapis.com/v1beta/...
```

**Files to create:**
```
apps/web/src/app/api/oauth/google/route.ts     → initiate flow
apps/web/src/app/api/oauth/google/callback/route.ts  → exchange code for token
packages/ai-providers/src/providers/gemini.ts  → extend existing provider to support Bearer token auth
```

**Environment variables needed:**
```bash
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
```

---

## 5. Anthropic & OpenAI: API Keys Only

These providers have no OAuth flow. The current API key form is correct.

**Recommended UI additions (no code changes to auth flow, only copy changes):**

- Show a warning when key field is empty: "Your Claude Max or ChatGPT subscription does not include API access. Get an API key at [link]."
- Link directly to the correct key page (Anthropic console, OpenAI platform) — do not just say "API key required."
- Add model list fetch: hit `https://api.anthropic.com/v1/models` and `https://api.openai.com/v1/models` after key is saved and validated to populate the model selector dynamically.

---

## 6. Local Providers (Ollama, LM Studio, vLLM)

No auth tokens needed. Current implementation is correct.

**Recommended improvements:**
- Add UI to configure Ollama/LMStudio base URL (currently hardcoded in provider files)
- Fetch model list dynamically from `GET {baseUrl}/api/tags` (Ollama) or `GET {baseUrl}/v1/models` (LMStudio/vLLM)
- Show connection status with a live ping indicator

---

## 7. Implementation Order

| Priority | Provider | Effort | Value |
|----------|----------|--------|-------|
| 1 | GitHub Copilot (device flow) | 2–3 days | High — real subscription-to-API bridge |
| 2 | UI copy improvements (Anthropic, OpenAI warnings) | 2 hr | High — prevents user confusion |
| 3 | Dynamic model list (all providers) | 1 day | High — removes hardcoded model lists |
| 4 | Local provider URL configuration UI | 4 hr | Medium — makes local providers configurable |
| 5 | Google Gemini OAuth (GCP) | 2–3 days | Medium — only useful for GCP users |

---

## 8. Security Requirements

- **Never log access tokens or refresh tokens** — treat them like passwords
- **Store tokens encrypted at rest** — consider `pgcrypto` column encryption for `access_token` and `refresh_token` columns
- **Validate state parameter** in authorization code flows (already done in Casdoor OIDC; apply same pattern)
- **Use PKCE** for all OAuth 2.0 authorization code flows (no client secret in browser)
- **Token refresh errors** must revoke the stored credential and prompt re-auth — never silently fail
- **HTTPS only** for all OAuth redirect URIs — enforce in `.env.example` validation

---

## 9. Environment Variables to Add to `.env.example`

```bash
# GitHub Copilot OAuth (device flow — client_id only, no secret needed for device flow)
GITHUB_COPILOT_CLIENT_ID=Iv1.b507a08c87ecfe98

# Google OAuth (required only for GCP-based Gemini access)
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
# Redirect URI must match Google Console: ${NEXTAUTH_URL}/api/oauth/google/callback
```

> Note: GitHub device flow does not require a client secret (it is a public client flow).
> The client_id above is the published GitHub Copilot VS Code extension client ID — acceptable to use.
