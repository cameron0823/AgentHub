# LobeHub Gap Analysis & Feature Report

**Date:** 2026-05-17
**Status:** Archived snapshot. `TODO.md` is the current source of truth for completion state.
**Source:** Comparison between AgentHub current implementation and LobeHub Parity Roadmap.

This report captured gaps as they existed on 2026-05-17. Several items below were implemented and verified after this snapshot, including persistent route navigation, MCP marketplace/governance paths, artifacts UI, in-chat file viewing, collaborative pages, projects/notebooks, automated i18n checks, Gemini OAuth runtime support, routing policies, the agent builder assistant, personal memory maintenance, and MCP configuration UI/API coverage. Future agents must use `TODO.md` before treating any item here as still open.

## 1. Missing Features (Not Started)

These features are entirely absent from the current AgentHub codebase and UI:

- **Heterogeneous Agent Runtime:** Mounting CLI agents like Claude Code or Codex inside the chat session.
- **MCP Marketplace:** A remote index for discovering and installing MCP servers.
- **One-Click MCP Install:** Protocol handler for seamless tool installation on desktop.
- **Artifacts UI Rendering:** Although schema exists, there is no UI panel to render HTML/React/SVG snippets.
- **In-Chat File Viewer:** No interactive viewer for PDFs, code, or office docs with chunk navigation.
- **Collaborative Pages:** Rich document editor with version support (P40.1).
- **Projects & Notebooks:** High-level containers for organizing agents, chats, and files (P40.2).
- **Automated i18n:** Dynamic translation of agent outputs and UI.

## 2. Features Needing Added Work (Partial Implementation)

These features have a foundation but require significant hardening or UI work:

- **Provider OAuth Flow:** Archived finding. Current implementation supports GitHub Copilot device flow and Google Gemini GCP OAuth runtime credentials; remaining supported cloud providers are API-key/OpenAI-compatible paths or out of scope until a real provider-supported subscription API OAuth path exists.
- **Intelligent Routing:** Basic model selection exists, but cost-based, speed-first, or reasoning-first routing policies are missing.
- **Vision & Image Understanding:** Basic image upload exists, but video flows and OCR-specific optimizations are pending.
- **Agent Builder Assistant:** A manual form exists, but the AI-powered meta-agent for agent configuration is missing.
- **Personal White-Box Memory Maintenance:** Manual CRUD exists, but a dedicated maintenance agent for conflict detection and decay is missing.
- **MCP Standard Mode:** STDIO/HTTP client exists but is "orphaned" (no UI or tRPC routes for user configuration).

## 3. Roadmap Update: Paid Subscription & OAuth

The following strategic item has been added to `TODO.md` (P2.4):

- **Model Verification via OAuth for Paid Subscriptions:**
  - Implementation of OAuth flows for all major cloud providers.
  - Integration with `user_quotas` table to verify subscription tier before allowing access to premium models.
  - Tier-based model availability gates in the provider registry.
