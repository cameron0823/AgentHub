"use client";

import { useTransition } from "react";
import { locales, type Locale } from "@/i18n/request";
import { setLocale } from "@/i18n/actions";

const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
};

interface LocaleSwitcherProps {
  currentLocale: Locale;
}

export function LocaleSwitcher({ currentLocale }: LocaleSwitcherProps) {
  const [isPending, startTransition] = useTransition();

  function onChange(locale: Locale) {
    startTransition(() => {
      setLocale(locale);
    });
  }

  return (
    <select
      value={currentLocale}
      onChange={(e) => onChange(e.target.value as Locale)}
      disabled={isPending}
      className="bg-background border border-border rounded px-2 py-1 text-sm text-foreground"
      aria-label="Select language"
    >
      {locales.map((loc) => (
        <option key={loc} value={loc}>
          {LOCALE_LABELS[loc]}
        </option>
      ))}
    </select>
  );
}
