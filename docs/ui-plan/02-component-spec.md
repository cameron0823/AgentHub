# AgentHub UI Plan - Component Spec

## Shell Components

| Component           | Purpose                                                          | Props/API sketch                                           | Parent                 | LobeHub reference                     |
| ------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------- | ------------------------------------- |
| `AppShell`          | Own global workspace chrome, panels, overlays, and route outlet. | `{ children: ReactNode; publicMode?: boolean }`            | `app/(app)/layout.tsx` | `src/routes/(main)/_layout/index.tsx` |
| `ShellContentFrame` | Clipped inner surface for workspace body.                        | `{ children; rightPanel?: ReactNode; footer?: ReactNode }` | `AppShell`             | `DesktopLayoutContainer.tsx`          |
| `DesktopTitleBar`   | Future desktop title bar, tabs, back/forward. Disabled on web.   | `{ tabs; activeTabId; onNewTab; onCloseTab }`              | `AppShell`             | `features/Electron/titlebar/*`        |
| `NavPanelProvider`  | Register and render named sidebar slots.                         | `{ activeKey; children }`, `registerNavPanel(key, node)`   | `AppShell`             | `features/NavPanel/index.tsx`         |
| `ResizableNavPanel` | Persisted left panel with min/max width and collapse.            | `{ activeKey; minWidth; maxWidth; defaultWidth }`          | `AppShell`             | `NavPanelDraggable.tsx`               |
| `WorkspaceHeader`   | Dense per-workspace title, search, actions.                      | `{ title; subtitle?; icon?; actions? }`                    | workspace pages        | Lobe route headers                    |
| `RightWorkPanel`    | Contextual panel for artifacts, files, tasks, agent builder.     | `{ mode; width; onResize; onClose; children }`             | `ShellContentFrame`    | Agent builder/right panels            |

Implementation targets:

- Create: `apps/web/src/components/shell/AppShell.tsx`
- Create: `apps/web/src/components/shell/ShellContentFrame.tsx`
- Create: `apps/web/src/components/shell/ResizableNavPanel.tsx`
- Create: `apps/web/src/components/shell/NavPanelProvider.tsx`
- Create: `apps/web/src/components/shell/RightWorkPanel.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Modify later: route-specific layouts under `apps/web/src/app/*`

## Navigation Components

| Component            | Purpose                                                         | Props/API sketch                                                   | Parent                 | LobeHub reference               |
| -------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------- | ------------------------------- |
| `PrimaryNav`         | Main navigation registry.                                       | `{ items; activePath; collapsed }`                                 | `ResizableNavPanel`    | `useNavLayout.ts`               |
| `NavItem`            | Reusable nav row with icon, active state, tooltip, action slot. | `{ icon; label; href?; active?; collapsed?; actions?; onSelect? }` | `PrimaryNav`, sidebars | `home/_layout/Body/NavItem.tsx` |
| `SidebarSection`     | Collapsible/hideable sidebar section.                           | `{ id; title; count?; children; actions? }`                        | sidebar bodies         | home sidebar body               |
| `SidebarSectionMenu` | Hide/reorder/customize section controls.                        | `{ sectionId; onHide; onMove }`                                    | `SidebarSection`       | sidebar context menus           |
| `SessionNavList`     | Chat session list with pin/rename/delete/search.                | `{ sessions; activeId; onSelect; onRename; onDelete; onPin }`      | chat nav panel         | current `SessionList`           |
| `AgentNavList`       | Agent list with edit/start chat actions.                        | `{ agents; activeId; onEdit; onStartChat }`                        | home nav panel         | current `AgentList`             |
| `GroupNavList`       | Agent group list.                                               | `{ groups; agents; activeId; onEdit; onStartChat }`                | home nav panel         | current `AgentGroupList`        |

Implementation targets:

- Split from `apps/web/src/components/Sidebar.tsx`.
- Preserve current `AgentList`, `AgentGroupList`, and session behavior initially.
- Add persisted section visibility/order after extraction.

## Overlay Components

| Component            | Purpose                                                    | Props/API sketch                                      | Parent        | LobeHub reference                     |
| -------------------- | ---------------------------------------------------------- | ----------------------------------------------------- | ------------- | ------------------------------------- |
| `CommandMenu`        | Global command/search/create palette.                      | `{ open; onOpenChange }` plus command registry        | `AppShell`    | `features/CommandMenu/*`              |
| `CommandRegistry`    | Source of commands: routes, create flows, settings, theme. | `registerCommand({ id, title, keywords, icon, run })` | `CommandMenu` | `MainMenu.tsx`                        |
| `HotkeyHelpModal`    | Searchable shortcut help grouped by scope.                 | `{ open; groups }`                                    | `AppShell`    | `HotkeyHelperPanel`                   |
| `NotificationCenter` | Persistent notifications.                                  | `notify({ type, title, body, action? })`              | `AppShell`    | `components/Notification`             |
| `ToastLayer`         | Short-lived operation messages.                            | `toast.success/error/info`                            | `AppShell`    | AntD message usage                    |
| `GlobalDragLayer`    | Visual overlay for chat/resource drag events.              | `{ activeContext; fileCount }`                        | `AppShell`    | `DndContextWrapper`, `DragUploadZone` |

Implementation targets:

- Upgrade `apps/web/src/components/SearchModal.tsx` rather than replacing it in one step.
- Extend `apps/web/src/components/KeyboardShortcuts.tsx`.
- Add overlay state to a new UI store.

## Chat Components

| Component            | Purpose                                               | Props/API sketch                                  | Parent             | LobeHub reference                           |
| -------------------- | ----------------------------------------------------- | ------------------------------------------------- | ------------------ | ------------------------------------------- |
| `ChatWorkspace`      | Chat page orchestration.                              | `{ sessionId?: string }`                          | route outlet       | `agent/index.tsx`, `Conversation/index.tsx` |
| `ConversationHeader` | Active agent/group/model context and actions.         | `{ session; agent?; group?; model; actions }`     | `ChatWorkspace`    | chat route headers                          |
| `MessageList`        | Virtualized list wrapper.                             | `{ messages; renderMessage; onRangeChange? }`     | `ChatWorkspace`    | `ChatList/index.tsx`                        |
| `MessageItem`        | Role-dispatching wrapper.                             | `{ message; actions }`                            | `MessageList`      | `Messages/index.tsx`                        |
| `UserMessage`        | User message body/actions.                            | `{ message; onEdit; onBranch }`                   | `MessageItem`      | user message renderer                       |
| `AssistantMessage`   | Assistant body, reasoning, artifacts, citations.      | `{ message; onRegenerate; onFeedback }`           | `MessageItem`      | assistant renderer                          |
| `ToolMessage`        | Tool call/result inspector.                           | `{ toolCall?; toolResult? }`                      | `MessageItem`      | current `ToolCallCard`                      |
| `ReasoningTimeline`  | Expandable thinking/timing steps.                     | `{ reasoning; steps?; isStreaming? }`             | `AssistantMessage` | `Reasoning.tsx`                             |
| `MarkdownRenderer`   | Markdown, code, Mermaid, math, custom tags.           | `{ content; sources?; variant }`                  | messages, docs     | Lobe Markdown                               |
| `ArtifactPanel`      | Preview artifacts from `messages.artifacts`.          | `{ artifact; sandboxMode }`                       | `RightWorkPanel`   | Lobe artifacts                              |
| `ChatComposer`       | Plugin-capable composer replacing textarea over time. | `{ value; attachments; actions; onSend; onStop }` | `ChatWorkspace`    | `ChatInput/Desktop`                         |
| `ComposerActionBar`  | Model, tools, file, prompt, voice, context actions.   | `{ actions; collapsedGroups? }`                   | `ChatComposer`     | `ActionBar/config.ts`                       |
| `AttachmentTray`     | Uploaded files/images before send.                    | `{ attachments; onRemove; onRetry }`              | `ChatComposer`     | chat file context                           |
| `ContextTray`        | Selected KB/files/pages/tasks context.                | `{ items; onRemove }`                             | `ChatComposer`     | context container                           |

Implementation targets:

- Split `apps/web/src/components/ChatInterface.tsx`.
- Split `apps/web/src/components/ChatMessage.tsx`.
- Preserve `VirtualizedMessageList`.
- Extend `ChatInput.tsx` gradually; do not switch to Lexical until an ADR approves the editor dependency.

## Agent and Settings Components

| Component                    | Purpose                                             | Props/API sketch                                 | Parent                   | LobeHub reference          |
| ---------------------------- | --------------------------------------------------- | ------------------------------------------------ | ------------------------ | -------------------------- |
| `AgentSettingsWorkspace`     | Tabbed agent create/edit workspace.                 | `{ agentId? }`                                   | `/agents/*`              | `features/AgentSetting/*`  |
| `AgentSettingsTabs`          | Meta, prompt, model, tools, opening, knowledge.     | `{ activeTab; onTabChange }`                     | `AgentSettingsWorkspace` | `AgentSettingsContent.tsx` |
| `AgentPromptEditor`          | System prompt editor with variables/token count.    | `{ value; variables; onChange }`                 | agent settings           | `AgentPrompt/index.tsx`    |
| `AgentModelForm`             | Model params and routing controls.                  | `{ model; temperature; maxTokens; routePolicy }` | agent settings           | `AgentModal/index.tsx`     |
| `AgentToolSelector`          | Tools/plugins/MCP/skills selector.                  | `{ selectedTools; profile?; onChange }`          | agent settings           | `AgentPlugin/index.tsx`    |
| `AgentBuilderAssistantPanel` | Natural language config assistant with review diff. | `{ agentId?; onApplyDiff }`                      | `RightWorkPanel`         | `AgentBuilder/index.tsx`   |
| `SettingsWorkspace`          | Sidebar/detail settings layout.                     | `{ section; providerId? }`                       | `/settings/*`            | `settings/_layout/*`       |
| `ProviderSettingsWorkspace`  | Provider catalog and credentials.                   | `{ providerId? }`                                | settings                 | `settings/provider/*`      |
| `McpSettingsWorkspace`       | MCP server configuration.                           | `{ serverId? }`                                  | settings                 | MCP settings patterns      |
| `TrustSettingsWorkspace`     | Trust policies, credentials, audits.                | `{ policyId? }`                                  | settings                 | governance patterns        |

Implementation targets:

- Refactor `AgentBuilder.tsx`, `ProviderSettings.tsx`, `McpSettings.tsx`, `TrustSettings.tsx`, and `settings/page.tsx`.
- Keep existing tRPC routers and forms while moving layout/navigation first.

## Marketplace, Resource, and Task Components

| Component              | Purpose                                         | Props/API sketch                           | Parent               | LobeHub reference       |
| ---------------------- | ----------------------------------------------- | ------------------------------------------ | -------------------- | ----------------------- |
| `MarketplaceWorkspace` | Search, filters, local/remote catalog tabs.     | `{ tab; query; category }`                 | `/marketplace`       | `community/*`           |
| `MarketplaceGrid`      | Virtualized card grid.                          | `{ items; renderCard; emptyState }`        | marketplace          | `VirtuosoGridList`      |
| `MarketplaceCard`      | Agent/skill/MCP item card.                      | `{ item; status; actions }`                | grid                 | community cards         |
| `ResourceWorkspace`    | Knowledge bases, files, query, documents.       | `{ knowledgeBaseId? }`                     | `/knowledge/*`       | `resource/*`            |
| `FileViewer`           | PDF/code/image/video/doc viewer with citations. | `{ file; highlight?; onNavigateCitation }` | resource/right panel | `features/FileViewer/*` |
| `TaskWorkspace`        | Task list, kanban/list modes, agent assignment. | `{ filters; selectedTaskId? }`             | `/tasks`             | task feature research   |
| `AgentWorkingPanel`    | Contextual documents/tasks beside chat.         | `{ sessionId; selectedTab }`               | `RightWorkPanel`     | Lobe working panel      |

Implementation targets:

- Upgrade `AgentMarketplace.tsx`, `KnowledgeBaseManager.tsx`, and `TaskManager.tsx`.
- Add file viewer only after SSRF/XSS and file permission checks are centralized.

## Testing Hooks

Every new component should expose stable test selectors for Playwright where user-visible labels are not enough:

- `data-testid="app-shell"`
- `data-testid="nav-panel"`
- `data-testid="command-menu"`
- `data-testid="chat-composer"`
- `data-testid="message-list"`
- `data-testid="right-work-panel"`
- `data-testid="settings-sidebar"`
- `data-testid="marketplace-grid"`

Prefer role/name selectors in tests first; use `data-testid` for dense icon controls and non-text panels.
