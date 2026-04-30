import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadMatchedListings } from "@/listings/store";
import { isQueryEmpty, type ListingsQuery } from "@/listings/url-state";
import { ListingsCardList } from "./listings-card-list";
import { ListingsEmpty } from "./listings-empty";
import { ListingsError } from "./listings-error";
import { ListingsPagination } from "./listings-pagination";
import { ListingsTable } from "./listings-table";

export async function ListingsResultSlot({
  userId,
  query,
}: {
  userId: string;
  query: ListingsQuery;
}) {
  let result;
  try {
    result = await loadMatchedListings(userId, query);
  } catch {
    return <ListingsError />;
  }

  if (result.rows.length === 0) {
    return <ListingsEmpty hasActiveFilters={!isQueryEmpty(query)} />;
  }

  if (query.view === "map") {
    return <MapViewPlaceholder />;
  }

  return (
    <div className="flex flex-col gap-3">
      <ListingsTable rows={result.rows} sort={query.sort} />
      <ListingsCardList rows={result.rows} />
      <ListingsPagination page={result.page} pageCount={result.pageCount} total={result.total} />
    </div>
  );
}

async function MapViewPlaceholder() {
  const t = await getTranslations("Listings.mapPlaceholder");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{t("body")}</CardContent>
    </Card>
  );
}
