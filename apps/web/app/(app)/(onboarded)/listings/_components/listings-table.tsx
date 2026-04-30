import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { MatchedListing } from "@/listings/types";
import type { ListingsSort } from "@/listings/url-state";
import { activeDirection } from "../_lib/sort-columns";
import { formatPrice, formatRelative } from "../_lib/format";
import { ListingsSortButton } from "./listings-sort-button";
import { ListingsSourceBadge } from "./listings-source-badge";

const ariaSortFor = (
  sort: ListingsSort,
  column: "postedAt" | "price" | "rooms",
): "ascending" | "descending" | "none" => {
  const dir = activeDirection(sort, column);
  return dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none";
};

export async function ListingsTable({
  rows,
  sort,
}: {
  rows: MatchedListing[];
  sort: ListingsSort;
}) {
  const t = await getTranslations("Listings.table");
  const locale = await getLocale();
  const now = new Date();

  return (
    <div className="hidden overflow-hidden rounded-md border bg-background sm:block">
      <table className="w-full text-sm" aria-label={t("ariaLabel")}>
        <colgroup>
          <col className="w-[34%]" />
          <col className="w-[12%]" />
          <col className="w-[16%]" />
          <col className="w-[18%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
        </colgroup>
        <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 text-start font-medium">
              {t("columns.title")}
            </th>
            <th
              scope="col"
              className="whitespace-nowrap px-3 py-2 text-start font-medium"
              aria-sort={ariaSortFor(sort, "price")}
            >
              <ListingsSortButton column="price">{t("columns.price")}</ListingsSortButton>
            </th>
            <th
              scope="col"
              className="whitespace-nowrap px-3 py-2 text-start font-medium"
              aria-sort={ariaSortFor(sort, "rooms")}
            >
              <ListingsSortButton column="rooms">{t("columns.rooms")}</ListingsSortButton>
            </th>
            <th scope="col" className="px-3 py-2 text-start font-medium">
              {t("columns.neighborhood")}
            </th>
            <th scope="col" className="whitespace-nowrap px-3 py-2 text-start font-medium">
              {t("columns.source")}
            </th>
            <th
              scope="col"
              className="whitespace-nowrap px-3 py-2 text-start font-medium"
              aria-sort={ariaSortFor(sort, "postedAt")}
            >
              <ListingsSortButton column="postedAt">{t("columns.postedAt")}</ListingsSortButton>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => {
            const sizeBits = [
              r.rooms != null ? t("cell.rooms", { value: r.rooms }) : null,
              r.sqm != null ? t("cell.sqm", { value: r.sqm }) : null,
            ].filter(Boolean);
            return (
              <tr key={r.id} className="hover:bg-muted/30">
                <td className="px-3 py-3 align-top font-medium">
                  <Link
                    href={`/listings/${r.id}`}
                    className="hover:underline focus-visible:underline focus-visible:outline-none"
                  >
                    <bdi>{r.formattedAddress ?? t("cell.untitled")}</bdi>
                  </Link>
                </td>
                <td className="whitespace-nowrap px-3 py-3 align-top tabular-nums">
                  <bdi>{formatPrice(r.priceNis, locale)}</bdi>
                </td>
                <td className="whitespace-nowrap px-3 py-3 align-top text-muted-foreground">
                  <bdi>{sizeBits.length > 0 ? sizeBits.join(" · ") : "—"}</bdi>
                </td>
                <td className="px-3 py-3 align-top text-muted-foreground">
                  <bdi>{r.neighborhood ?? "—"}</bdi>
                </td>
                <td className="whitespace-nowrap px-3 py-3 align-top text-muted-foreground">
                  <ListingsSourceBadge source={r.source} />
                </td>
                <td className="whitespace-nowrap px-3 py-3 align-top text-muted-foreground">
                  <time dateTime={(r.postedAt ?? r.alertedAt).toISOString()}>
                    <bdi>{formatRelative(r.postedAt ?? r.alertedAt, locale, now)}</bdi>
                  </time>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
