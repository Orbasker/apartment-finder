"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useListingsQuery } from "../_hooks/use-listings-query";

export function ListingsHeader() {
  const t = useTranslations("Listings.header");
  const { query, isPending, setQuery, clearAll } = useListingsQuery();

  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  if (query.priceMin !== null) {
    chips.push({
      key: "priceMin",
      label: t("chips.priceMin", { value: query.priceMin.toLocaleString("he-IL") }),
      onRemove: () => setQuery({ priceMin: null }),
    });
  }
  if (query.priceMax !== null) {
    chips.push({
      key: "priceMax",
      label: t("chips.priceMax", { value: query.priceMax.toLocaleString("he-IL") }),
      onRemove: () => setQuery({ priceMax: null }),
    });
  }
  if (query.rooms !== null) {
    chips.push({
      key: "rooms",
      label: t("chips.rooms", { value: query.rooms }),
      onRemove: () => setQuery({ rooms: null }),
    });
  }
  for (const name of query.neighborhood) {
    chips.push({
      key: `n-${name}`,
      label: name,
      onRemove: () => setQuery({ neighborhood: query.neighborhood.filter((p) => p !== name) }),
    });
  }

  const showClear = chips.length > 0 || query.sort !== "newest";

  return (
    <section className="flex flex-col gap-3 border-b pb-3" aria-busy={isPending || undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <div data-slot="view-toggle" className="flex items-center gap-1">
          <Button
            variant={query.view === "table" ? "default" : "outline"}
            size="sm"
            onClick={() => setQuery({ view: "table" }, { history: "push", resetPage: false })}
          >
            {t("view.table")}
          </Button>
          <Button
            variant={query.view === "map" ? "default" : "outline"}
            size="sm"
            onClick={() => setQuery({ view: "map" }, { history: "push", resetPage: false })}
          >
            {t("view.map")}
          </Button>
        </div>

        <div className="ms-auto flex items-center gap-2">
          <label className="text-xs text-muted-foreground" htmlFor="listings-sort">
            {t("sort.label")}
          </label>
          <select
            id="listings-sort"
            className="h-8 rounded-md border bg-background px-2 text-sm"
            value={query.sort}
            onChange={(e) =>
              setQuery({ sort: e.target.value as typeof query.sort }, { history: "replace" })
            }
          >
            <option value="newest">{t("sort.newest")}</option>
            <option value="oldest">{t("sort.oldest")}</option>
            <option value="priceAsc">{t("sort.priceAsc")}</option>
            <option value="priceDesc">{t("sort.priceDesc")}</option>
            <option value="roomsAsc">{t("sort.roomsAsc")}</option>
            <option value="roomsDesc">{t("sort.roomsDesc")}</option>
          </select>
        </div>
      </div>

      {chips.length > 0 ? (
        <div
          className="flex flex-wrap items-center gap-2"
          role="list"
          aria-label={t("chips.label")}
        >
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              role="listitem"
              onClick={c.onRemove}
              className="inline-flex items-center gap-1 rounded-full border bg-muted px-3 py-1 text-xs hover:bg-muted/80"
              aria-label={t("chips.removeAria", { label: c.label })}
            >
              <bdi>{c.label}</bdi>
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      ) : null}

      {showClear ? (
        <div>
          <Button variant="ghost" size="sm" onClick={clearAll}>
            {t("clearAll")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
