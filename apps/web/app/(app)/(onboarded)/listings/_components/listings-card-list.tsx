import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { MatchedListing } from "@/listings/types";
import { formatPrice, formatRelative } from "../_lib/format";
import { ListingsSourceBadge } from "./listings-source-badge";

export async function ListingsCardList({ rows }: { rows: MatchedListing[] }) {
  const t = await getTranslations("Listings.table");
  const locale = await getLocale();
  const now = new Date();

  return (
    <ul className="flex flex-col gap-2 sm:hidden" aria-label={t("ariaLabel")}>
      {rows.map((r) => {
        const sizeBits = [
          r.rooms != null ? t("cell.rooms", { value: r.rooms }) : null,
          r.sqm != null ? t("cell.sqm", { value: r.sqm }) : null,
          r.neighborhood,
        ].filter(Boolean);
        const when = r.postedAt ?? r.alertedAt;

        return (
          <li key={r.id}>
            <Link
              href={`/listings/${r.id}`}
              className="flex flex-col gap-1 rounded-md border bg-background p-3 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">
                  <bdi>{r.formattedAddress ?? t("cell.untitled")}</bdi>
                </span>
                <span className="whitespace-nowrap font-medium tabular-nums">
                  <bdi>{formatPrice(r.priceNis, locale)}</bdi>
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                <bdi>{sizeBits.length > 0 ? sizeBits.join(" · ") : "—"}</bdi>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <ListingsSourceBadge source={r.source} />
                <time dateTime={when.toISOString()}>
                  <bdi>{formatRelative(when, locale, now)}</bdi>
                </time>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
