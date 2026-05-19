"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Theme = "light" | "dark" | "system";
export type AccentPalette = "blue" | "cyan" | "emerald" | "amber" | "rose";
export type LayoutMode = "chat" | "document";

export const AGENTHUB_THEME_SETTINGS_KEY = "agenthub-theme-settings";

const LEGACY_THEME_KEY = "theme";
const SETTINGS_VERSION = 1;

export const ACCENT_PALETTES: AccentPalette[] = ["blue", "cyan", "emerald", "amber", "rose"];
export const LAYOUT_MODES: LayoutMode[] = ["chat", "document"];
export const THEME_MODES: Theme[] = ["light", "dark", "system"];

type ResolvedTheme = "light" | "dark";

interface ThemeSettingsState {
  version: typeof SETTINGS_VERSION;
  theme: Theme;
  accentPalette: AccentPalette;
  layoutMode: LayoutMode;
}

interface ThemeContextValue extends ThemeSettingsState {
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  setAccentPalette: (accentPalette: AccentPalette) => void;
  setLayoutMode: (layoutMode: LayoutMode) => void;
}

const DEFAULT_SETTINGS: ThemeSettingsState = {
  version: SETTINGS_VERSION,
  theme: "dark",
  accentPalette: "blue",
  layoutMode: "chat",
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && THEME_MODES.includes(value as Theme);
}

function isAccentPalette(value: unknown): value is AccentPalette {
  return typeof value === "string" && ACCENT_PALETTES.includes(value as AccentPalette);
}

function isLayoutMode(value: unknown): value is LayoutMode {
  return typeof value === "string" && LAYOUT_MODES.includes(value as LayoutMode);
}

function readThemeSettings(): ThemeSettingsState {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;

  const legacyTheme = window.localStorage.getItem(LEGACY_THEME_KEY);
  const rawSettings = window.localStorage.getItem(AGENTHUB_THEME_SETTINGS_KEY);

  if (!rawSettings) {
    return {
      ...DEFAULT_SETTINGS,
      theme: isTheme(legacyTheme) ? legacyTheme : DEFAULT_SETTINGS.theme,
    };
  }

  try {
    const parsed = JSON.parse(rawSettings) as Partial<ThemeSettingsState>;
    return {
      version: SETTINGS_VERSION,
      theme: isTheme(parsed.theme) ? parsed.theme : isTheme(legacyTheme) ? legacyTheme : DEFAULT_SETTINGS.theme,
      accentPalette: isAccentPalette(parsed.accentPalette) ? parsed.accentPalette : DEFAULT_SETTINGS.accentPalette,
      layoutMode: isLayoutMode(parsed.layoutMode) ? parsed.layoutMode : DEFAULT_SETTINGS.layoutMode,
    };
  } catch {
    return {
      ...DEFAULT_SETTINGS,
      theme: isTheme(legacyTheme) ? legacyTheme : DEFAULT_SETTINGS.theme,
    };
  }
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyThemeSettings(settings: ThemeSettingsState, resolvedTheme: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolvedTheme);
  root.dataset.agenthubAccent = settings.accentPalette;
  root.dataset.agenthubLayout = settings.layoutMode;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ThemeSettingsState>(DEFAULT_SETTINGS);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSettings(readThemeSettings());
    setHydrated(true);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = () => setSystemTheme(mediaQuery.matches ? "dark" : "light");

    handleSystemThemeChange();
    mediaQuery.addEventListener("change", handleSystemThemeChange);
    return () => mediaQuery.removeEventListener("change", handleSystemThemeChange);
  }, []);

  const resolvedTheme: ResolvedTheme = settings.theme === "system" ? systemTheme : settings.theme;

  useEffect(() => {
    if (!hydrated) return;

    applyThemeSettings(settings, resolvedTheme);
    window.localStorage.setItem(AGENTHUB_THEME_SETTINGS_KEY, JSON.stringify(settings));
    window.localStorage.setItem(LEGACY_THEME_KEY, settings.theme);
  }, [hydrated, resolvedTheme, settings]);

  const setTheme = useCallback((theme: Theme) => {
    setSettings((current) => ({ ...current, theme }));
  }, []);

  const setAccentPalette = useCallback((accentPalette: AccentPalette) => {
    setSettings((current) => ({ ...current, accentPalette }));
  }, []);

  const setLayoutMode = useCallback((layoutMode: LayoutMode) => {
    setSettings((current) => ({ ...current, layoutMode }));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      ...settings,
      resolvedTheme,
      setTheme,
      setAccentPalette,
      setLayoutMode,
    }),
    [resolvedTheme, setAccentPalette, setLayoutMode, setTheme, settings],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
