# AgentHub UI Plan - Design Tokens

## Goals

AgentHub should keep its Tailwind/CSS-variable token system and extend it into a workspace-grade token set inspired by LobeHub's layout constants and theme provider model.

Do not copy LobeHub token names. Use `agenthub-*` names for new semantic tokens and keep existing Tailwind compatibility.

## Current Tokens

Current source:

- `apps/web/src/app/globals.css`
- `apps/web/tailwind.config.ts`
- `apps/web/src/components/ThemeProvider.tsx`
- `apps/web/src/app/layout.tsx`

Current CSS variables:

- `--background`
- `--foreground`
- `--card`
- `--card-foreground`
- `--popover`
- `--popover-foreground`
- `--primary`
- `--primary-foreground`
- `--secondary`
- `--secondary-foreground`
- `--muted`
- `--muted-foreground`
- `--accent`
- `--accent-foreground`
- `--destructive`
- `--destructive-foreground`
- `--border`
- `--input`
- `--ring`
- `--radius`

Current theme behavior:

- dark mode is default
- pre-hydration inline script applies stored theme
- `ThemeProvider` stores `theme` in localStorage
- Tailwind uses `darkMode: "class"`

## Proposed Semantic Token Layer

Add these CSS variables in `globals.css`, mapped to existing HSL variables initially:

```css
:root {
  --agenthub-bg-app: hsl(var(--background));
  --agenthub-bg-panel: hsl(var(--card));
  --agenthub-bg-elevated: hsl(var(--popover));
  --agenthub-bg-hover: hsl(var(--muted));
  --agenthub-border-subtle: hsl(var(--border));
  --agenthub-border-strong: hsl(var(--muted-foreground) / 0.28);
  --agenthub-text-primary: hsl(var(--foreground));
  --agenthub-text-muted: hsl(var(--muted-foreground));
  --agenthub-accent: hsl(var(--primary));
  --agenthub-accent-muted: hsl(var(--accent));
  --agenthub-danger: hsl(var(--destructive));
}
```

## Layout Tokens

Add layout tokens based on LobeHub's layout constants but adjusted for AgentHub's current UI:

```css
:root {
  --agenthub-titlebar-height: 0px;
  --agenthub-mobile-topbar-height: 48px;
  --agenthub-left-panel-min: 240px;
  --agenthub-left-panel-default: 280px;
  --agenthub-left-panel-max: 400px;
  --agenthub-right-panel-min: 320px;
  --agenthub-right-panel-default: 420px;
  --agenthub-right-panel-max: 720px;
  --agenthub-chat-composer-min: 48px;
  --agenthub-chat-composer-default: 120px;
  --agenthub-chat-composer-max: 320px;
  --agenthub-content-max: 1024px;
  --agenthub-chat-content-max: 900px;
}
```

Desktop Electron builds can later override:

```css
.agenthub-desktop {
  --agenthub-titlebar-height: 40px;
}
```

## Spacing

Use a compact operational scale:

| Token                |     Value | Use                      |
| -------------------- | --------: | ------------------------ |
| `--agenthub-space-1` | `0.25rem` | icon gaps, tiny controls |
| `--agenthub-space-2` |  `0.5rem` | nav rows, small buttons  |
| `--agenthub-space-3` | `0.75rem` | list rows                |
| `--agenthub-space-4` |    `1rem` | panel padding            |
| `--agenthub-space-5` | `1.25rem` | dense section padding    |
| `--agenthub-space-6` |  `1.5rem` | page padding             |
| `--agenthub-space-8` |    `2rem` | large form gaps          |

Rules:

- Prefer `p-3` or `p-4` for panels.
- Use `p-6` only for page-level workspaces.
- Avoid oversized empty sections in operational views.

## Radius

Keep AgentHub compact:

| Token                     |      Value | Use                      |
| ------------------------- | ---------: | ------------------------ |
| `--agenthub-radius-xs`    |  `0.25rem` | tags, indicators         |
| `--agenthub-radius-sm`    | `0.375rem` | nav rows, icon buttons   |
| `--agenthub-radius-md`    |   `0.5rem` | inputs, menus            |
| `--agenthub-radius-lg`    |  `0.75rem` | modals, repeated cards   |
| `--agenthub-radius-shell` |  `0.75rem` | desktop inner frame only |

Do not increase card radius beyond `0.75rem` unless a specific component needs it.

## Typography

Current fonts:

- Geist Sans
- Geist Mono

Proposed type roles:

| Role                 | Tailwind                 | Use                          |
| -------------------- | ------------------------ | ---------------------------- |
| `agenthub-text-xs`   | `text-xs`                | metadata, chips, nav counts  |
| `agenthub-text-sm`   | `text-sm`                | body UI, buttons, dense rows |
| `agenthub-text-base` | `text-base`              | readable content             |
| `agenthub-title-sm`  | `text-lg font-semibold`  | panel headings               |
| `agenthub-title-md`  | `text-xl font-semibold`  | workspace headings           |
| `agenthub-title-lg`  | `text-2xl font-semibold` | main page title only         |
| `agenthub-mono`      | `font-mono text-xs`      | code, tool args, IDs         |

Rules:

- Do not use viewport-scaled font sizes.
- Keep letter spacing normal except existing uppercase micro-labels.
- Reserve `text-2xl` for workspace page headings, not cards.

## Shadows and Elevation

Use restrained elevation:

```css
:root {
  --agenthub-shadow-popover: 0 8px 32px hsl(0 0% 0% / 0.28);
  --agenthub-shadow-modal: 0 20px 80px hsl(0 0% 0% / 0.42);
  --agenthub-shadow-panel: 0 1px 2px hsl(0 0% 0% / 0.16);
}
```

Rules:

- Borders carry most structure.
- Shadows are for overlays, floating panels, and modals.
- Avoid stacked card-on-card compositions.

## Z-Index Policy

```css
:root {
  --agenthub-z-base: 0;
  --agenthub-z-nav: 30;
  --agenthub-z-drawer: 40;
  --agenthub-z-popover: 50;
  --agenthub-z-command: 60;
  --agenthub-z-modal: 70;
  --agenthub-z-toast: 80;
  --agenthub-z-drag: 90;
}
```

Rules:

- Mobile nav drawer uses `--agenthub-z-drawer`.
- Command menu uses `--agenthub-z-command`.
- Drag overlay must sit above command/modal only if actively dragging.

## Color Palette Direction

Preserve AgentHub's current dark-neutral plus green accent identity. This avoids copying LobeHub's branding while still matching the operational density.

Recommended adjustments:

- Keep primary green as the action/accent color.
- Add semantic status colors for success, warning, info, and danger.
- Use neutral panel surfaces instead of one-note green-tinted backgrounds.
- Avoid large gradients or decorative backgrounds in app workspaces.

## Implementation Notes

Files to update:

- `apps/web/src/app/globals.css`
- `apps/web/tailwind.config.ts`
- `apps/web/src/components/ThemeProvider.tsx`
- future `apps/web/src/components/shell/*`

Add Tailwind aliases only after CSS variables exist:

```ts
colors: {
  app: "var(--agenthub-bg-app)",
  panel: "var(--agenthub-bg-panel)",
  elevated: "var(--agenthub-bg-elevated)",
}
```

## Hydration Rule

For theme and layout preferences:

- Server-render a stable default.
- Use `suppressHydrationWarning` only where unavoidable, as currently done on `<html>`.
- Gate client-only measured widths behind mounted state.
- Never render `Date.now()`, `Math.random()`, locale-formatted dates, or localStorage-derived values directly during server render.
