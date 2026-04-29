import { getRequestConfig } from "next-intl/server";

const LOCALE = "he";
const TIME_ZONE = "Asia/Jerusalem";

export default getRequestConfig(async () => {
  const messages = (await import(`../../messages/${LOCALE}.json`)).default;
  return {
    locale: LOCALE,
    timeZone: TIME_ZONE,
    messages,
  };
});
