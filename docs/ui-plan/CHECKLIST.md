# AgentHub UI Implementation Checklist

Use this checklist while implementing the LobeHub-inspired AgentHub UI plan. Check items only after the listed validation passes.

## Before Implementation

- [ ] Confirm current branch and worktree status with `git status --short`.
- [ ] Review `docs/ui-plan/00-overview.md`.
- [ ] Review `docs/ui-plan/01-information-architecture.md`.
- [ ] Review `docs/ui-plan/02-component-spec.md`.
- [ ] Review `docs/ui-plan/03-design-tokens.md`.
- [ ] Review `docs/ui-plan/04-state-and-data.md`.
- [ ] Review `docs/ui-plan/05-implementation-roadmap.md`.
- [ ] Review `docs/ui-plan/06-deviations-and-rationale.md`.
- [ ] Review `docs/ui-plan/07-validation-deliverables.md`.
- [ ] Confirm no LobeHub source, branding, logos, or proprietary assets are being copied.
- [ ] Confirm any adapted source-level idea has Apache-2.0 attribution where required.

## Phase UI-0 - Baseline and Tests

- [ ] Capture current Playwright screenshots for `/`, `/settings`, `/kb`, `/tasks`, `/automations`, and `/analytics`.
- [ ] Add or refresh smoke tests for sidebar collapse.
- [ ] Add or refresh smoke tests for new chat.
- [ ] Add or refresh smoke tests for command/search modal.
- [ ] Add or refresh smoke tests for settings route.
- [ ] Add or refresh smoke tests for KB route.
- [ ] Add or refresh smoke tests for chat send with mocked stream where practical.
- [ ] Run `pnpm -C apps/web test:e2e`.
- [ ] Run `pnpm -C apps/web typecheck`.
- [ ] Record baseline findings before refactoring.

## Phase UI-1 - Shell Extraction

- [ ] Create `apps/web/src/components/shell/AppShell.tsx`.
- [ ] Create `apps/web/src/components/shell/ShellContentFrame.tsx`.
- [ ] Create `apps/web/src/components/shell/shellStore.ts`.
- [ ] Create `apps/web/src/components/shell/NotificationCenter.tsx`.
- [ ] Create `apps/web/src/components/shell/GlobalDragLayer.tsx`.
- [ ] Move authenticated private-layout ownership from `apps/web/src/app/page.tsx` into `AppShell`.
- [ ] Mount command/search and keyboard shortcut surfaces under the shell.
- [ ] Preserve current visual layout.
- [ ] Run `pnpm -C apps/web typecheck`.
- [ ] Run `pnpm -C apps/web test:e2e -- chat-smoke.spec.ts`.
- [ ] Run `git diff --check`.
- [ ] Verify no hydration warnings in browser console.

## Phase UI-2 - Navigation Panels

- [ ] Split `Sidebar.tsx` into navigation subcomponents.
- [ ] Create `apps/web/src/components/navigation/NavItem.tsx`.
- [ ] Create `apps/web/src/components/navigation/PrimaryNav.tsx`.
- [ ] Create `apps/web/src/components/navigation/SessionNavList.tsx`.
- [ ] Create `apps/web/src/components/navigation/SidebarSection.tsx`.
- [ ] Create `apps/web/src/components/shell/NavPanelProvider.tsx`.
- [ ] Create `apps/web/src/components/shell/ResizableNavPanel.tsx`.
- [ ] Add mounted-safe persisted panel width.
- [ ] Add mounted-safe persisted collapsed state.
- [ ] Preserve mobile drawer behavior.
- [ ] Add sidebar section visibility/order persistence.
- [ ] Verify session select, pin, rename, delete, new chat, new agent, and new group.
- [ ] Run `pnpm -C apps/web typecheck`.
- [ ] Run `pnpm test -- pin-conversations.test.mjs`.
- [ ] Run `pnpm -C apps/web test:e2e`.

## Phase UI-3 - Route-First Workspaces

- [ ] Add `/chat/[sessionId]`.
- [ ] Add `/agents`.
- [ ] Add `/agents/new`.
- [ ] Add `/agents/[agentId]`.
- [ ] Add `/groups`.
- [ ] Add `/groups/new`.
- [ ] Add `/groups/[groupId]`.
- [ ] Add `/memory`.
- [ ] Add `/marketplace`.
- [ ] Add `/knowledge`.
- [ ] Add `/knowledge/[knowledgeBaseId]`.
- [ ] Convert `setMainView` calls to route navigation with compatibility state.
- [ ] Verify existing home flow still works.
- [ ] Verify `/share/[slug]` stays public and does not mount private shell.
- [ ] Run `pnpm -C apps/web typecheck`.
- [ ] Run `pnpm -C apps/web test:e2e`.

## Phase UI-4 - Chat View Refactor

- [ ] Extract `useChatStream`.
- [ ] Create `apps/web/src/components/chat/MessageItem.tsx`.
- [ ] Create `apps/web/src/components/chat/AssistantMessage.tsx`.
- [ ] Create `apps/web/src/components/chat/UserMessage.tsx`.
- [ ] Create `apps/web/src/components/chat/ToolMessage.tsx`.
- [ ] Create `apps/web/src/components/chat/MarkdownRenderer.tsx`.
- [ ] Create `apps/web/src/components/chat/ReasoningTimeline.tsx`.
- [ ] Preserve streaming content.
- [ ] Preserve tool calls and tool results.
- [ ] Preserve reasoning display.
- [ ] Preserve RAG citations.
- [ ] Preserve Mermaid, math, code highlighting, and code copy.
- [ ] Preserve branching, edit, regenerate, and feedback.
- [ ] Run `pnpm test -- chat-stream.test.mjs`.
- [ ] Run `pnpm test -- chat-stream-behavioral.test.ts`.
- [ ] Run `pnpm test -- rag-citations.test.mjs`.
- [ ] Run `pnpm test -- message-feedback.test.mjs`.
- [ ] Run `pnpm -C apps/web test:e2e -- chat-smoke.spec.ts`.

## Phase UI-5 - Composer and Overlays

- [ ] Create `apps/web/src/components/chat/ChatComposer.tsx`.
- [ ] Create `apps/web/src/components/chat/ComposerActionBar.tsx`.
- [ ] Create `apps/web/src/components/chat/AttachmentTray.tsx`.
- [ ] Create `apps/web/src/components/chat/ContextTray.tsx`.
- [ ] Create `apps/web/src/components/command/CommandMenu.tsx`.
- [ ] Create `apps/web/src/components/command/commandRegistry.ts`.
- [ ] Preserve send and stop behavior.
- [ ] Preserve attachment upload behavior.
- [ ] Preserve voice input behavior.
- [ ] Preserve slash prompt insertion.
- [ ] Add command actions for route navigation.
- [ ] Add command actions for create flows.
- [ ] Add command actions for theme/settings.
- [ ] Add hotkey helper modal.
- [ ] Run `pnpm test -- prompt-library.test.mjs`.
- [ ] Run `pnpm test -- search-modal.test.mjs`.
- [ ] Run `pnpm -C apps/web test:e2e`.

## Phase UI-6 - Agent Settings Workspace

- [ ] Split `AgentBuilder.tsx` into workspace components.
- [ ] Create `AgentSettingsWorkspace`.
- [ ] Create `AgentSettingsTabs`.
- [ ] Create `AgentPromptEditor`.
- [ ] Create `AgentModelForm`.
- [ ] Create `AgentToolSelector`.
- [ ] Create `AgentBuilderAssistantPanel` placeholder.
- [ ] Preserve create agent.
- [ ] Preserve edit agent.
- [ ] Preserve delete agent.
- [ ] Preserve export agent.
- [ ] Add route-first new/edit views.
- [ ] Run `pnpm test -- agent-crud-isolation.test.mjs`.
- [ ] Run `pnpm -C apps/web typecheck`.
- [ ] Run `pnpm -C apps/web test:e2e`.

## Phase UI-7 - Settings and Provider Workspace

- [ ] Convert `/settings` into sidebar/detail workspace.
- [ ] Add `/settings/providers`.
- [ ] Add `/settings/providers/[providerId]`.
- [ ] Add `/settings/mcp`.
- [ ] Add `/settings/prompts`.
- [ ] Add `/settings/trust`.
- [ ] Preserve provider credential create/delete.
- [ ] Preserve provider credential test.
- [ ] Preserve model fetch.
- [ ] Preserve GitHub Copilot OAuth device flow.
- [ ] Preserve MCP server settings.
- [ ] Preserve prompt library settings.
- [ ] Preserve trust settings.
- [ ] Run `pnpm test -- mcp-settings.test.mjs`.
- [ ] Run `pnpm test -- mcp-security.test.mjs`.
- [ ] Run `pnpm test -- security-coverage.test.mjs`.
- [ ] Run `pnpm -C apps/web test:e2e`.

## Phase UI-8 - Marketplace, Resource, and Task Polish

- [ ] Convert `AgentMarketplace` into `MarketplaceWorkspace`.
- [ ] Add query-driven marketplace tabs and filters.
- [ ] Add `MarketplaceGrid`.
- [ ] Convert `KnowledgeBaseManager` into `ResourceWorkspace`.
- [ ] Add safe `FileViewer` placeholder.
- [ ] Add task filters.
- [ ] Add task detail panel.
- [ ] Preserve local catalog install.
- [ ] Preserve manifest import/export.
- [ ] Preserve KB upload, ingest, query, and delete.
- [ ] Preserve task create/run/dependency behavior.
- [ ] Run `pnpm test -- kb-rag.test.mjs`.
- [ ] Run `pnpm test -- tasks.test.mjs`.
- [ ] Run `pnpm -C apps/web test:e2e`.

## Phase UI-9 - Right Panels and Artifacts

- [ ] Confirm centralized SSRF/XSS protections exist before HTML artifact preview.
- [ ] Create `ArtifactPanel`.
- [ ] Create `AgentWorkingPanel`.
- [ ] Create `FilePanel`.
- [ ] Add `RightWorkPanel` mode persistence.
- [ ] Add right panel resize persistence.
- [ ] Wire safe `messages.artifacts` previews.
- [ ] Add sandboxed iframe preview only after sanitizer is implemented.
- [ ] Add file/citation viewer integration.
- [ ] Add keyboard toggle for right panel.
- [ ] Run `pnpm test -- security-coverage.test.mjs`.
- [ ] Run `pnpm -C apps/web test:e2e`.

## Phase UI-10 - Desktop and PWA Polish

- [ ] Preserve manifest and service worker registration.
- [ ] Add desktop title-bar abstraction behind feature flag only.
- [ ] Add drag/no-drag CSS only for desktop runtime.
- [ ] Add desktop screenshot check at `1440x1000`.
- [ ] Add mobile screenshot check at `390x844`.
- [ ] Verify app shell controls viewport height and inner scroll regions.
- [ ] Run `pnpm -C apps/web test:e2e`.
- [ ] Run `pnpm validate`.

## Final Acceptance

- [ ] `pnpm typecheck` passes.
- [ ] `pnpm lint` passes.
- [ ] `pnpm test` passes.
- [ ] `pnpm -C apps/web test:e2e` passes.
- [ ] `pnpm validate` passes.
- [ ] `git diff --check` passes.
- [ ] No new hydration mismatch warnings appear in browser console.
- [ ] Desktop viewport layout is coherent at `1440x1000`.
- [ ] Mobile viewport layout is coherent at `390x844`.
- [ ] Keyboard navigation works for command menu, chat send, sidebar, and modal close.
- [ ] No LobeHub branding, logos, icons, or proprietary assets are copied.
- [ ] Apache-2.0 attribution is present if any source-level adaptation is introduced later.
