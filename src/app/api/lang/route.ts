import { isLocale, LOCALE_COOKIE, safeReturnPath } from "@/i18n/locales";

/**
 * GET /api/lang?to=es&next=/prepare — remember a language choice and go back.
 * Plain links reach it, so switching language needs no form and no JavaScript.
 */
export function GET(request: Request): Response {
  const url = new URL(request.url);
  const to = url.searchParams.get("to");
  const next = safeReturnPath(url.searchParams.get("next"));
  const headers = new Headers({ Location: next, "Cache-Control": "no-store" });
  if (isLocale(to)) {
    // A preference, not an identifier: one year, same-site, readable only by the server.
    headers.append("Set-Cookie", `${LOCALE_COOKIE}=${to}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly`);
  }
  return new Response(null, { status: 303, headers });
}
