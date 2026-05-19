import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { headers } from "next/headers";
import { resolveRequestLocale, type Locale } from "./config";
import { loadMessages } from "./namespaces";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const cookieLocale = cookieStore.get("locale")?.value as Locale | undefined;
  const locale = resolveRequestLocale(cookieLocale, headerStore.get("accept-language"));

  return {
    locale,
    messages: await loadMessages(locale),
  };
});
