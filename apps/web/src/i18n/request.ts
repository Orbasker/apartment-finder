import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "@/i18n/locales";

const TIME_ZONE = "Asia/Jerusalem";

async function resolveLocale(): Promise<Locale> {
  try {
    const cookieStore = await cookies();
    const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
    if (isLocale(fromCookie)) return fromCookie;
  } catch {
    // outside a request scope (e.g. during build); fall through
  }
  try {
    const h = await headers();
    const accept = h.get("accept-language") ?? "";
    const tag = accept.split(",")[0]?.split(";")[0]?.trim().toLowerCase();
    const primary = tag?.split("-")[0];
    if (isLocale(primary)) return primary;
  } catch {
    // ignore
  }
  return DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return {
    locale,
    timeZone: TIME_ZONE,
    messages,
  };
});
