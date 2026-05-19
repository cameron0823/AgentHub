"use client";

import { useState, useEffect, useTransition } from "react";
import { getLocaleDirection, localeLabels, locales, type Locale } from "@/i18n/config";
import { setLocale } from "@/i18n/actions";

export function LocaleSwitcher() {
  const [current, setCurrent] = useState<Locale>("en");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const lang = document.documentElement.lang as Locale;
    if (locales.includes(lang)) setCurrent(lang);
  }, []);

  function onChange(locale: Locale) {
    setCurrent(locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = getLocaleDirection(locale);
    startTransition(() => {
      setLocale(locale);
    });
  }

  return (
    <select
      value={current}
      onChange={(e) => onChange(e.target.value as Locale)}
      disabled={isPending}
      className="agenthub-field px-2 py-1 text-sm"
      aria-label="Select language"
    >
      {locales.map((loc) => (
        <option key={loc} value={loc}>
          {localeLabels[loc]}
        </option>
      ))}
    </select>
  );
}
