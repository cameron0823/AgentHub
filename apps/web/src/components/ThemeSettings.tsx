"use client";

import { Check, FileText, MessageSquare, Monitor, Moon, Sun } from "lucide-react";
import { type AccentPalette, type LayoutMode, type Theme, useTheme } from "./ThemeProvider";

const themeOptions: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

const layoutOptions: Array<{ value: LayoutMode; label: string; icon: typeof MessageSquare }> = [
  { value: "chat", label: "Chat", icon: MessageSquare },
  { value: "document", label: "Document", icon: FileText },
];

interface AccentButtonProps {
  palette: AccentPalette;
  label: string;
  swatchClassName: string;
  selected: boolean;
  onSelect: (palette: AccentPalette) => void;
  "data-testid": string;
}

function AccentButton({
  palette,
  label,
  swatchClassName,
  selected,
  onSelect,
  "data-testid": testId,
}: AccentButtonProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={`${label} accent`}
      aria-pressed={selected}
      onClick={() => onSelect(palette)}
      className={`group flex min-h-16 flex-col items-center justify-center gap-2 rounded-lg border px-2 py-2 text-xs transition-colors ${
        selected
          ? "border-primary/70 bg-primary/15 text-foreground"
          : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10"
      }`}
    >
      <span className={`flex h-6 w-6 items-center justify-center rounded-full ${swatchClassName}`}>
        {selected && <Check className="h-3.5 w-3.5 text-white" />}
      </span>
      <span>{label}</span>
    </button>
  );
}

export function ThemeSettings() {
  const { theme, setTheme, accentPalette, setAccentPalette, layoutMode, setLayoutMode, resolvedTheme } = useTheme();

  return (
    <div data-testid="theme-settings" className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Appearance</h2>
          <p className="mt-1 text-sm text-muted-foreground">Local display settings for this device.</p>
        </div>
        <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs capitalize text-muted-foreground">
          {resolvedTheme}
        </span>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">Theme mode</div>
        <div className="grid grid-cols-3 gap-2">
          {themeOptions.map((option) => {
            const Icon = option.icon;
            const selected = theme === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setTheme(option.value)}
                className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  selected
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">Accent palette</div>
        <div className="grid grid-cols-5 gap-2">
          <AccentButton
            data-testid="accent-swatch-blue"
            palette="blue"
            label="Blue"
            swatchClassName="bg-[#0a84ff]"
            selected={accentPalette === "blue"}
            onSelect={setAccentPalette}
          />
          <AccentButton
            data-testid="accent-swatch-cyan"
            palette="cyan"
            label="Cyan"
            swatchClassName="bg-[#0891b2]"
            selected={accentPalette === "cyan"}
            onSelect={setAccentPalette}
          />
          <AccentButton
            data-testid="accent-swatch-emerald"
            palette="emerald"
            label="Emerald"
            swatchClassName="bg-[#10b981]"
            selected={accentPalette === "emerald"}
            onSelect={setAccentPalette}
          />
          <AccentButton
            data-testid="accent-swatch-amber"
            palette="amber"
            label="Amber"
            swatchClassName="bg-[#f59e0b]"
            selected={accentPalette === "amber"}
            onSelect={setAccentPalette}
          />
          <AccentButton
            data-testid="accent-swatch-rose"
            palette="rose"
            label="Rose"
            swatchClassName="bg-[#e11d48]"
            selected={accentPalette === "rose"}
            onSelect={setAccentPalette}
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">Conversation layout</div>
        <div className="grid grid-cols-2 gap-2">
          {layoutOptions.map((option) => {
            const Icon = option.icon;
            const selected = layoutMode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setLayoutMode(option.value)}
                className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  selected
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
