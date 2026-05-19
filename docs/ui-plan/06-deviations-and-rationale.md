# AgentHub UI Plan - Deviations and Rationale

## Dependency Deviations

### Do not adopt `@lobehub/ui`

Rationale:

- AgentHub already uses Tailwind, Lucide, and local components.
- Pulling in `@lobehub/ui` would add a large design-system dependency and increase coupling to LobeHub implementation details.
- The goal is functional/workspace parity, not source-level UI cloning.

Decision:

- Rebuild equivalent primitives as AgentHub components.
- Keep the component API small and local until repeated patterns justify extraction.

### Do not adopt Ant Design or `antd-style` now

Rationale:

- AgentHub currently has no Ant Design dependency.
- Mixing AntD and Tailwind would create styling and token conflicts.
- Existing forms, buttons, cards, and modals are simple enough to improve locally.

Decision:

- Continue with Tailwind and CSS variables.
- Add overlay, form, and panel primitives locally.
- Reconsider only if future enterprise settings surfaces become too expensive to maintain.

### Do not adopt Lexical immediately

Rationale:

- LobeHub uses a Lexical-based editor kernel, but AgentHub's current composer is a textarea with slash prompts, attachments, voice input, and send/stop controls.
- A rich editor migration has higher risk than shell/navigation refactors.

Decision:

- First build `ChatComposer` with plugin-style action architecture around the current textarea.
- Add a later ADR for Lexical or another editor only after inline mentions, file snapshots, prompt refinement, and rich document editing requirements are finalized.

## Product Deviations

### AgentHub keeps its own visual identity

Rationale:

- LobeHub branding, logos, and icons must not be copied.
- AgentHub already has a green-accent, local-first identity.

Decision:

- Use Lucide icons and AgentHub tokens.
- Mirror density and workspace patterns, not brand visuals.

### Desktop title bar is planned, not implemented immediately

Rationale:

- AgentHub currently runs as a Next.js web/PWA app.
- LobeHub Desktop uses Electron-specific IPC, tabs, title bar, keychain, filesystem, and window-state behavior.
- Adding desktop chrome without a desktop runtime would create dead UI.

Decision:

- Add `DesktopTitleBar` as a feature-flagged abstraction later.
- Keep web shell clean and desktop-safe.

### Settings remain NextAuth-backed until auth architecture is separately decided

Rationale:

- LobeHub uses Better Auth in current architecture.
- AgentHub code currently uses NextAuth with Drizzle adapter and Casdoor/dev credentials.
- Replacing auth while doing UI shell work would raise risk and scope.

Decision:

- UI settings plan should not force an auth migration.
- Track Better Auth or SSO parity under the existing Phase 41 roadmap, not this UI shell plan.

### Local-first sync is not part of the UI shell phase

Rationale:

- LobeHub's current primary architecture is server-centric PostgreSQL; local-first IndexedDB/CRDT sync is not required for the shell.
- AgentHub already uses PostgreSQL/pgvector and server-side tRPC.

Decision:

- Keep server persistence as the default.
- Only add local-first sync after a separate data architecture decision.

## Implementation Deviations

### Route-first migration must be gradual

Rationale:

- AgentHub currently uses `mainView` inside Zustand for several workspaces.
- Removing it immediately would touch most major UI flows.

Decision:

- Introduce routes and use `setMainView` as a compatibility bridge.
- Remove `mainView` only when all relevant workspaces have stable routes.

### Preserve existing `VirtualizedMessageList`

Rationale:

- LobeHub uses virtualized conversation rendering.
- AgentHub already has `VirtualizedMessageList`.

Decision:

- Keep it as the list engine.
- Refactor message rendering around it instead of replacing the list.

### Build command menu from `SearchModal`

Rationale:

- `SearchModal` already handles keyboard open, debounced search, grouped results, and session navigation.
- A rewrite would risk regressing search.

Decision:

- Expand `SearchModal` into `CommandMenu` with a command registry.
- Keep conversation search as one command/search mode.

### File viewer waits for security hardening

Rationale:

- LobeHub has rich file viewing and artifact rendering.
- AgentHub should not render arbitrary HTML or fetch arbitrary media before SSRF/XSS policies are centralized.

Decision:

- Start with safe file metadata and text/code/PDF preview.
- Add artifact iframe preview only after sanitizer and sandbox policy exist.

### Right panel comes after shell and chat refactor

Rationale:

- Right-side panels depend on stable shell measurements, route context, and chat message artifacts.

Decision:

- Implement after shell, navigation, route-first workspaces, and chat renderer extraction.

## Testing Deviations

### Use Playwright, not unavailable Browser plugin

Rationale:

- The requested Browser automation plugin is not available in this environment.
- AgentHub already has Playwright installed.

Decision:

- Use Playwright for UI automation and screenshots.
- Prefer role/name selectors, with stable `data-testid` for dense controls.

### Screenshot checks are regression aids, not sole correctness criteria

Rationale:

- UI behavior includes keyboard shortcuts, route state, persistence, streaming, and auth state.

Decision:

- Pair screenshots with functional checks for clicks, routes, keyboard actions, network mocked streaming, and persistence after reload.

## Documentation Deviations

### Keep this plan separate from feature parity roadmaps

Rationale:

- `docs/plans/2026-05-15-lobehub-parity-roadmap.md` and `docs/plans/2026-05-15-lobehub-feature-task-plans.md` already cover broad product parity.
- This `docs/ui-plan/` pack is specifically about UI/UX and frontend architecture.

Decision:

- Cross-reference feature roadmap when needed.
- Do not duplicate every Phase 33-43 product task in the UI plan.

## Open Decisions for Later ADRs

- Whether to adopt Lexical for chat composer and Pages editor.
- Whether AgentHub will add an Electron desktop target.
- Whether Better Auth replaces NextAuth.
- Whether command menu should support AI ask mode in the first release.
- Whether right-panel artifacts should be stored as message metadata only or promoted to first-class resources.
- Whether provider and MCP marketplaces should share one marketplace shell or separate workspaces.
