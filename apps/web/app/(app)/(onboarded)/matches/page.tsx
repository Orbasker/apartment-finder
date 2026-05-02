import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth-server";
import { loadFilters } from "@/filters/store";
import { getMatchFeed, loadMedianContext } from "@/matches/store";
import { buildAnnotations } from "@/matches/annotations";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MatchesTabs } from "./_components/matches-tabs";
import { FeedDeck, type FeedDeckEntry } from "./_components/feed-deck";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "דירות - Apartment Finder",
};

export default async function MatchesPage() {
  const t = await getTranslations("Matches");
  const user = (await getCurrentUser())!;
  const [filters, page] = await Promise.all([loadFilters(user.id), getMatchFeed(user.id)]);

  const cityIds = filters.cities.map((c) => c.cityId);
  const median = await loadMedianContext(cityIds);

  const annotationContext = {
    median,
    center:
      filters.radius != null
        ? { lat: filters.radius.centerLat, lon: filters.radius.centerLon }
        : null,
    userAttrs: filters.attributes,
  };

  const entries: FeedDeckEntry[] = page.items.map((item) => ({
    item,
    annotations: buildAnnotations(item, annotationContext),
  }));

  return (
    <main className="flex w-full flex-col gap-4 sm:gap-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </header>

      <MatchesTabs active="feed" />

      {entries.length === 0 ? <EmptyNoMatches /> : <FeedDeck initialEntries={entries} />}
    </main>
  );
}

async function EmptyNoMatches() {
  const t = await getTranslations("Matches.feed");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("emptyNoMatchesTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>{t("emptyNoMatchesBody")}</p>
        <Link
          href="/filters"
          className="inline-flex h-8 items-center justify-center rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted"
        >
          {t("editFilters")}
        </Link>
      </CardContent>
    </Card>
  );
}
