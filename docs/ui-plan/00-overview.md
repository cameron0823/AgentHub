# AgentHub UI Plan - Overview

Created: 2026-05-15
AgentHub path: `/home/coxar/projects/AgentHub`
LobeHub reference path: `/home/coxar/agenthub-research/lobe-chat`
LobeHub reference commit: `ba6980f`

## Purpose

This plan translates the LobeHub Desktop/LobeChat UI and frontend architecture analysis into an AgentHub implementation plan. It focuses on layout, navigation, component boundaries, state ownership, design tokens, and build order.

AgentHub should mirror LobeHub's workspace patterns where they fit the current product, while keeping AgentHub's existing stack:

- Next.js 15.5.18
- React 18.3.1
- Tailwind CSS
- Lucide icons
- Zustand
- TanStack Query
- tRPC
- Drizzle/PostgreSQL/pgvector
- NextAuth
- Playwright

Do not adopt `@lobehub/ui`, Ant Design, or `antd-style` unless a later ADR explicitly approves that cost.

## Attribution

LobeChat/LobeHub is Apache-2.0 licensed. These docs use LobeHub as an architecture and product design reference only. No LobeHub source code, branding, logos, icons, or proprietary visual assets are copied into AgentHub.

If future implementation adapts a specific source structure or snippet rather than only the pattern, preserve Apache-2.0 attribution in the relevant file or documentation.

## Current AgentHub UI Snapshot

Current high-level UI:

- `apps/web/src/app/layout.tsx` provides global HTML, theme script, providers, and service worker registration.
- `apps/web/src/app/page.tsx` owns authenticated home routing and switches between `ChatInterface`, `AgentBuilder`, `AgentGroupBuilder`, `MemoryEditor`, `AgentMarketplace`, `TaskManager`, and `AdminPanel`.
- `apps/web/src/components/Sidebar.tsx` owns navigation, sessions, agents, groups, footer links, collapse state, and mobile drawer behavior.
- Feature routes exist for `/kb`, `/tasks`, `/settings`, `/analytics`, `/automations`, and `/admin`.
- `apps/web/src/stores/chatStore.ts` is the dominant client store for sessions, active view, agents, groups, memory, and sidebar state.
- `apps/web/src/components/SearchModal.tsx` is the current command/search modal.
- `apps/web/src/components/ChatInput.tsx`, `ChatInterface.tsx`, `VirtualizedMessageList.tsx`, `ChatMessage.tsx`, and `ToolCallCard.tsx` form the current chat surface.

Current strengths:

- Functional chat shell and streaming path already exist.
- Sidebar supports collapsed and mobile modes.
- Branching, model selection, context window display, RAG citations, tool calls, TTS, voice input, and Playwright smoke tests already exist.
- Tailwind tokens are already centralized in `globals.css` and `tailwind.config.ts`.

Current UI gaps relative to LobeHub:

- No route-independent app shell.
- No named nav-panel portal system.
- Sidebar is not resizable and mixes navigation, data fetching, session management, agent lists, and footer controls.
- Settings are a single vertical page rather than a sidebar-driven workspace.
- Agent builder is a monolithic form rather than tabbed settings plus assistant panel.
- Chat composer is a textarea with action buttons rather than a plugin-capable composer.
- No global command palette with create/settings/theme/route actions.
- No right-side working panel, artifacts panel, or file viewer panel.
- No central overlay/toast/notification layer.

## Pattern Mapping

| LobeHub pattern                                | AgentHub equivalent                                                 | Recommendation      |
| ---------------------------------------------- | ------------------------------------------------------------------- | ------------------- |
| Global `(main)` route shell                    | Extract from `app/page.tsx` into `AppShell`                         | Mirror structurally |
| `DesktopLayoutContainer` clipped inner surface | `ShellContentFrame` with Tailwind tokens                            | Adapt               |
| `NavPanelPortal` named sidebars                | `NavPanelProvider` and `NavPanelSlot`                               | Mirror conceptually |
| Resizable left panel persisted in global store | `shellStore.leftPanelWidth` and `settings`/localStorage persistence | Mirror              |
| Electron title bar and tab strip               | Future `DesktopTitleBar` behind desktop flag                        | Plan only           |
| Sidebar sections with reorder/hide             | `SidebarSectionRegistry` with persisted visibility/order            | Adapt               |
| Command menu                                   | Upgrade `SearchModal` into `CommandMenu`                            | Mirror conceptually |
| Hotkey helper panel                            | Extend `KeyboardShortcuts`                                          | Mirror              |
| Virtualized chat list                          | Existing `VirtualizedMessageList`                                   | Preserve and extend |
| Rich Lexical chat composer                     | Plugin-capable `ChatComposer`; avoid Lexical until ADR              | Adapt               |
| Message role renderer registry                 | Split `ChatMessage.tsx` into role/content blocks                    | Mirror              |
| Reasoning/thinking block                       | Extend current `reasoning` details into `ReasoningTimeline`         | Adapt               |
| Tool call inspector                            | Extend existing `ToolCallCard`                                      | Preserve and extend |
| Artifacts preview panel                        | New `ArtifactPanel` driven by `messages.artifacts`                  | Mirror conceptually |
| Agent settings tabs and builder panel          | Split `AgentBuilder.tsx` into tabbed workspace plus assistant       | Mirror              |
| Provider settings workspace                    | Split `/settings` into sidebar/detail routes                        | Mirror              |
| Marketplace virtual grid                       | Upgrade `AgentMarketplace` local catalog grid                       | Adapt               |
| Resource manager and file viewer               | Extend `KnowledgeBaseManager` and `files` data                      | Mirror conceptually |
| Global drag/drop contexts                      | Add chat upload and resource drag contexts                          | Adapt               |
| Design token provider                          | Keep Tailwind CSS variables; add `agenthub-*` aliases               | Adapt               |

## Architectural Direction

AgentHub should evolve from a page-switched dashboard into a workspace shell:

```text
RootLayout
└── Providers
    └── AppShell
        ├── optional DesktopTitleBar
        ├── ResizableNavPanel
        ├── ShellContentFrame
        │   ├── RouteWorkspace
        │   └── optional RightWorkPanel
        ├── CommandMenu
        ├── HotkeyHelpModal
        ├── NotificationCenter
        └── GlobalDragLayer
```

Implementation should be incremental. The first milestone should not rewrite the chat runtime. It should extract the shell, sidebar, and overlay boundaries while preserving current behavior and tests.

## Verification Commands

Commands discovered from real repo artifacts:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm -C apps/web test:e2e
pnpm validate
git diff --check
```

For narrow frontend work:

```bash
pnpm -C apps/web typecheck
pnpm -C apps/web lint
pnpm -C apps/web test:e2e
```

## Done When

This UI plan is implementation-ready when:

- `docs/ui-plan/` contains architecture, IA, components, tokens, state/data, roadmap, and deviations docs.
- Each planned component has a source reference and AgentHub integration target.
- The plan avoids LobeHub dependency or branding copy.
- The roadmap lists build order, dependencies, estimates, and validation commands.
- Phase 4 can use these docs to generate a side-by-side status table, Mermaid diagrams, and implementation checklist.
