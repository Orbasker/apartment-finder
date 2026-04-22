import Link from "next/link";
import { countListings, searchListings, type ListingRow } from "@/listings/queries";
import {
  buildFilterQueryString,
  hasActiveFilters,
  parseListingFilters,
  toListingsFilter,
  type DashboardSearchParams,
} from "@/listings/filter-params";
import { ListingsFiltersBar } from "@/listings/filters-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatNis, relTime } from "@/lib/utils";
import { RunJobsCard } from "./run-jobs-card";

export const dynamic = "force-dynamic";

export default async function DashboardHomePage({
  searchParams,
}: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  const rawParams = await searchParams;
  const filters = parseListingFilters(rawParams);
  const active = hasActiveFilters(filters);

  const [alertsToday, page, totalMatches] = await Promise.all([
    searchListings({ decision: "alert", hoursAgo: 24, limit: 30 }),
    searchListings(toListingsFilter(filters)),
    active ? countListings(toListingsFilter(filters)) : Promise.resolve<number | null>(null),
  ]);

  const baseFiltersQs = buildFilterQueryString(filters);
  const nextHref = page.nextCursor
    ? `/dashboard${buildFilterQueryString(filters, { cursor: page.nextCursor })}`
    : null;
  const resetCursorHref = filters.cursor
    ? `/dashboard${buildFilterQueryString(filters, { cursor: undefined })}`
    : null;

  return (
    <div className="space-y-8">
      <RunJobsCard />

      <section>
        <h2 className="mb-3 text-xl font-semibold">
          {`Today's alerts (${alertsToday.rows.length})`}
        </h2>
        {alertsToday.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing matched yet in the last 24 hours.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {alertsToday.rows.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold">Browse collected listings</h2>
          <ResultSummary
            shown={page.rows.length}
            total={totalMatches}
            limit={filters.limit}
            active={active}
            cursorActive={Boolean(filters.cursor)}
            resetCursorHref={resetCursorHref}
          />
        </div>

        <ListingsFiltersBar values={filters} hasActiveFilters={active} />

        {page.rows.length === 0 ? (
          <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
            No listings match these filters.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="p-2">When</th>
                  <th className="p-2">Source</th>
                  <th className="p-2">Price</th>
                  <th className="p-2">Rooms</th>
                  <th className="p-2">Neighborhood</th>
                  <th className="p-2">Score</th>
                  <th className="p-2">Decision</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {page.rows.map((l) => (
                  <tr key={l.id} className="border-t hover:bg-muted/50">
                    <td className="p-2 text-muted-foreground">{relTime(l.ingestedAt)}</td>
                    <td className="p-2">
                      <Badge variant="muted">{l.source}</Badge>
                    </td>
                    <td className="p-2">{formatNis(l.priceNis)}</td>
                    <td className="p-2">{l.rooms ?? "—"}</td>
                    <td className="p-2">{l.neighborhood ?? "—"}</td>
                    <td className="p-2">{l.score ?? "—"}</td>
                    <td className="p-2">
                      {l.decision ? <DecisionBadge decision={l.decision} /> : "—"}
                    </td>
                    <td className="p-2">
                      <Link
                        href={`/dashboard/listings/${l.id}`}
                        className="text-sm underline hover:text-primary"
                      >
                        open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between text-sm">
          <div className="text-muted-foreground">
            {filters.cursor ? (
              <Link href={`/dashboard${baseFiltersQs}`} className="underline">
                ← Back to first page
              </Link>
            ) : (
              <span />
            )}
          </div>
          {nextHref ? (
            <Link
              href={nextHref}
              className="rounded-md border px-3 py-1.5 font-medium hover:bg-muted"
            >
              Next {filters.limit} →
            </Link>
          ) : (
            page.rows.length > 0 && (
              <span className="text-muted-foreground">End of results</span>
            )
          )}
        </div>
      </section>
    </div>
  );
}

function ResultSummary({
  shown,
  total,
  limit,
  active,
  cursorActive,
  resetCursorHref,
}: {
  shown: number;
  total: number | null;
  limit: number;
  active: boolean;
  cursorActive: boolean;
  resetCursorHref: string | null;
}) {
  const parts: string[] = [];
  if (active) {
    parts.push(
      total != null
        ? `${total.toLocaleString()} match${total === 1 ? "" : "es"}`
        : `showing ${shown}`,
    );
  } else {
    parts.push(`${shown} of latest`);
  }
  if (cursorActive) parts.push(`page size ${limit}`);
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span>{parts.join(" · ")}</span>
      {cursorActive && resetCursorHref && (
        <Link href={resetCursorHref} className="underline hover:text-foreground">
          jump to first page
        </Link>
      )}
    </div>
  );
}

function DecisionBadge({ decision }: { decision: string }) {
  if (decision === "alert") return <Badge variant="success">alert</Badge>;
  if (decision === "skip") return <Badge variant="muted">skip</Badge>;
  return <Badge variant="muted">unsure</Badge>;
}

function ListingCard({ listing }: { listing: ListingRow }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="truncate text-base">
          {listing.neighborhood ?? listing.title ?? "Listing"}
        </CardTitle>
        <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
          <span>{formatNis(listing.priceNis)}</span>
          {listing.rooms && <span>· {listing.rooms} rooms</span>}
          {listing.score != null && <span>· score {listing.score}</span>}
        </div>
      </CardHeader>
      <CardContent>
        <p className="line-clamp-3 text-sm text-muted-foreground">
          {listing.reasoning ?? listing.description ?? ""}
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{relTime(listing.ingestedAt)}</span>
          <Link
            href={`/dashboard/listings/${listing.id}`}
            className="text-sm underline hover:text-primary"
          >
            open
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
