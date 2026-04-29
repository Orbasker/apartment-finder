"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/i18n/locales";
import { setLocaleAction } from "./set-locale-action";

export function LocaleSwitcher() {
  const current = useLocale() as Locale;
  const t = useTranslations("Login.localeSwitcher");
  const [pending, startTransition] = useTransition();

  function pick(next: Locale) {
    if (next === current || pending) return;
    startTransition(async () => {
      await setLocaleAction(next);
      window.location.reload();
    });
  }

  return (
    <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
      <span>{t("label")}:</span>
      {LOCALES.map((l) => {
        const active = l === current;
        return (
          <button
            key={l}
            type="button"
            onClick={() => pick(l)}
            disabled={pending || active}
            aria-pressed={active}
            className={
              active
                ? "font-semibold text-foreground"
                : "underline-offset-4 hover:underline disabled:opacity-50"
            }
          >
            {LOCALE_LABELS[l]}
          </button>
        );
      })}
    </div>
  );
}
