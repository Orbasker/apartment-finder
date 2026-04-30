"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useListingsQuery } from "../_hooks/use-listings-query";

export function ListingsPagination({
  page,
  pageCount,
  total,
}: {
  page: number;
  pageCount: number;
  total: number;
}) {
  const t = useTranslations("Listings.pagination");
  const { setQuery, isPending } = useListingsQuery();

  if (pageCount <= 1) return null;

  const goTo = (next: number) => {
    setQuery({ page: next }, { history: "push", resetPage: false });
  };

  const canPrev = page > 1;
  const canNext = page < pageCount;

  return (
    <nav
      className="flex items-center justify-between gap-2 pt-2 text-sm"
      aria-label={t("ariaLabel")}
    >
      <span className="text-xs text-muted-foreground">
        {t("status", { page, pageCount, total })}
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canPrev || isPending}
          onClick={() => goTo(page - 1)}
        >
          {t("prev")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canNext || isPending}
          onClick={() => goTo(page + 1)}
        >
          {t("next")}
        </Button>
      </div>
    </nav>
  );
}
