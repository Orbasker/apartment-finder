import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { isLocale, LOCALE_DIRECTIONS, DEFAULT_LOCALE } from "@/i18n/locales";
import { Toaster } from "@/components/ui/toaster";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { Footer } from "./footer";

export async function generateMetadata() {
  const t = await getTranslations("Layout.metadata");
  return {
    title: "Apartment Finder",
    description: t("description"),
  };
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

const themeInitScript = `
  (function() {
    try {
      var stored = localStorage.getItem('theme');
      var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      var isDark = stored ? stored === 'dark' : prefersDark;
      if (isDark) document.documentElement.classList.add('dark');
    } catch (e) {}
  })();
`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  const t = await getTranslations("Layout");
  const dir = LOCALE_DIRECTIONS[isLocale(locale) ? locale : DEFAULT_LOCALE];
  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-screen flex-col bg-background font-sans antialiased">
        <NextIntlClientProvider messages={messages}>
          <a
            href="#main-content"
            className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:start-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-primary focus-visible:px-4 focus-visible:py-2 focus-visible:text-primary-foreground"
          >
            {t("skipToContent")}
          </a>
          <div className="flex flex-1 flex-col">{children}</div>
          <Footer />
          <Toaster dir={dir} />
        </NextIntlClientProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
