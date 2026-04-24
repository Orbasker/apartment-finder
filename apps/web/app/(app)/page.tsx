import Link from "next/link";
import type { NormalizedListing, Preferences } from "@apartment-finder/shared";
import {
  countListings,
  searchListings,
  type ListingRow,
  type ListingsFilter,
} from "@/listings/queries";
import {
  buildFilterQueryString,
  hasActiveFilters,
  parseListingFilters,
  toListingsFilter,
  type DashboardSearchParams,
  type ParsedListingFilters,
} from "@/listings/filter-params";
import { ListingsFiltersBar } from "@/listings/filters-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatNis, relTime } from "@/lib/utils";
import { getRequestUser, isAdmin } from "@/lib/supabase/server";
import { loadPreferences } from "@/preferences/store";
import { getSubscribedGroupUrls } from "@/groups/subscriptions";
import { ruleFilter } from "@/pipeline/ruleFilter";
import { RunJobsCard } from "./run-jobs-card";

export const dynamic = "force-dynamic";

export default async function DashboardHomePage({
  searchParams,
}: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  const rawParams = await searchParams;
  const filters = parseListingFilters(rawParams);
  const urlActive = hasActiveFilters(filters);

  const user = await getRequestUser();
  const admin = isAdmin(user);

  const [prefs, subscribedGroupUrls] = user
    ? await Promise.all([
        loadPreferences(user.id),
        getSubscribedGroupUrls(user.id),
      ])
    : [null, undefined];
  const scope: Pick<ListingsFilter, "forUserId" | "subscribedGroupUrls"> = user
    ? { forUserId: user.id, subscribedGroupUrls }
    : {};

  const effectiveFilters: ParsedListingFilters =
    !urlActive && prefs ? seedFiltersFromPreferences(filters, prefs) : filters;
  const effectiveActive = hasActiveFilters(effectiveFilters);
  const prefsSeeded = !urlActive && effectiveActive;

  const [alertsToday, page, totalMatches] = await Promise.all([
    searchListings({ decision: "alert", hoursAgo: 24, limit: 30, ...scope }),
    searchListings({ ...toListingsFilter(effectiveFilters), ...scope }),
    effectiveActive
      ? countListings({ ...toListingsFilter(effectiveFilters), ...scope })
      : Promise.resolve<number | null>(null),
  ]);
  const applyUserRules = (rows: ListingRow[]): ListingRow[] =>
    prefs ? rows.filter((r) => ruleFilter(rowToListing(r), prefs).pass) : rows;
  const alertsTodayRows = applyUserRules(alertsToday.rows);
  const pageRows = applyUserRules(page.rows);

  const baseFiltersQs = buildFilterQueryString(filters);
  const nextHref = page.nextCursor
    ? `/${buildFilterQueryString(filters, { cursor: page.nextCursor })}`
    : null;
  const resetCursorHref = filters.cursor
    ? `/${buildFilterQueryString(filters, { cursor: undefined })}`
    : null;

  return (
    <div className="space-y-8">
      {admin && <RunJobsCard />}

      <CollapsibleSection
        title="Browse collected listings"
        headerRight={
          <ResultSummary
            shown={pageRows.length}
            total={totalMatches}
            limit={effectiveFilters.limit}
            active={effectiveActive}
            cursorActive={Boolean(filters.cursor)}
            resetCursorHref={resetCursorHref}
            prefsSeeded={prefsSeeded}
          />
        }
        defaultOpen
      >
        <div className="space-y-4">
          <ListingsFiltersBar
            values={effectiveFilters}
            hasActiveFilters={urlActive}
            prefsSeeded={prefsSeeded}
          />

          {pageRows.length === 0 ? (
            <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
              {prefsSeeded
                ? "No listings match your saved preferences. Widen the filters above to see more."
                : "No listings match these filters."}
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
                  {pageRows.map((l) => (
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
                          href={`/listings/${l.id}`}
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
                <Link href={`/${baseFiltersQs}`} className="underline">
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
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title={`Today's alerts (${alertsTodayRows.length})`}
        defaultOpen
      >
        {alertsTodayRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing matched yet in the last 24 hours.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {alertsTodayRows.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}

function CollapsibleSection({
  title,
  headerRight,
  defaultOpen,
  children,
}: {
  title: string;
  headerRight?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group">
      <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-2 rounded-md py-1 [&::-webkit-details-marker]:hidden">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <span
            aria-hidden="true"
            className="inline-block text-muted-foreground transition-transform group-open:rotate-90"
          >
            ▶
          </span>
          {title}
        </h2>
        {headerRight}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function ResultSummary({
  shown,
  total,
  limit,
  active,
  cursorActive,
  resetCursorHref,
  prefsSeeded,
}: {
  shown: number;
  total: number | null;
  limit: number;
  active: boolean;
  cursorActive: boolean;
  resetCursorHref: string | null;
  prefsSeeded: boolean;
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
  if (prefsSeeded) parts.push("from your preferences");
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

function seedFiltersFromPreferences(
  base: ParsedListingFilters,
  prefs: Preferences,
): ParsedListingFilters {
  return {
    ...base,
    minPriceNis:
      prefs.budget.minNis > 0 ? prefs.budget.minNis : base.minPriceNis,
    maxPriceNis: prefs.budget.maxNis,
    minRooms: prefs.rooms.min,
    maxRooms: prefs.rooms.max,
    minScore: prefs.ai.scoreThreshold,
    hoursAgo: prefs.maxAgeHours,
  };
}

function DecisionBadge({ decision }: { decision: string }) {
  if (decision === "alert") return <Badge variant="success">alert</Badge>;
  if (decision === "skip") return <Badge variant="muted">skip</Badge>;
  return <Badge variant="muted">unsure</Badge>;
}

function rowToListing(r: ListingRow): NormalizedListing {
  return {
    source: r.source as NormalizedListing["source"],
    sourceId: r.sourceId,
    url: r.url,
    title: r.title ?? null,
    description: r.description ?? null,
    priceNis: r.priceNis ?? null,
    rooms: r.rooms ?? null,
    sqm: r.sqm ?? null,
    neighborhood: r.neighborhood ?? null,
    street: r.street ?? null,
    postedAt: r.postedAt ?? null,
    isAgency: r.isAgency ?? null,
    authorName: r.authorName ?? null,
    authorProfile: null,
  };
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
            href={`/listings/${listing.id}`}
            className="text-sm underline hover:text-primary"
          >
            open
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
