// next/headers only works in server code, so this module cannot run in the browser.
import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, negotiateLocale, type Locale } from "./locales";

/** The visitor's language for server-rendered pages: saved choice, else browser preference. */
export async function getLocale(): Promise<Locale> {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  return negotiateLocale(cookieStore.get(LOCALE_COOKIE)?.value, headerList.get("accept-language"));
}
