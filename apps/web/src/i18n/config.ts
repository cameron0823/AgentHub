export const locales = ["en", "es", "fr", "ar"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export const localeLabels: Record<Locale, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  ar: "العربية",
};

export const localeDirections: Record<Locale, "ltr" | "rtl"> = {
  en: "ltr",
  es: "ltr",
  fr: "ltr",
  ar: "rtl",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && locales.includes(value as Locale);
}

export function getLocaleDirection(locale: Locale) {
  return localeDirections[locale] ?? "ltr";
}

export function resolveLocaleFromAcceptLanguage(acceptLanguage: string | null | undefined): Locale | undefined {
  if (!acceptLanguage) return undefined;
  const requested = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, qValue] = part.trim().split(";q=");
      return {
        tag: tag.toLowerCase(),
        weight: qValue ? Number(qValue) : 1,
      };
    })
    .filter((entry) => entry.tag)
    .sort((a, b) => b.weight - a.weight);

  for (const entry of requested) {
    const language = entry.tag.split("-")[0];
    if (isLocale(language)) return language;
  }
  return undefined;
}

export function resolveRequestLocale(
  cookieLocale: string | null | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  if (isLocale(cookieLocale)) return cookieLocale;
  return resolveLocaleFromAcceptLanguage(acceptLanguage) ?? defaultLocale;
}
