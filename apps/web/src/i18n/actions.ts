"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { locales, type Locale } from "./request";

export async function setLocale(locale: Locale) {
  if (!locales.includes(locale)) return;
  const cookieStore = await cookies();
  cookieStore.set("locale", locale, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}
