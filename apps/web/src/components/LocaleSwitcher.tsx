"use client";

import { useState, useEffect, useTransition } from "react";
import { locales, type Locale } from "@/i18n/request";
import { setLocale } from "@/i18n/actions";

const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
};

export function LocaleSwitcher() {
  const [current, setCurrent] = useState<Locale>("en");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const lang = document.documentElement.lang as Locale;
    if (locales.includes(lang)) setCurrent(lang);
  }, []);

  function onChange(locale: Locale) {
    setCurrent(locale);
    startTransition(() => {
      setLocale(locale);
    });
  }

  return (
    <select
      value={current}
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
