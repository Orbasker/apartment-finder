import { loadMatchedListings, loadMatchedListingsForMap } from "@/listings/store";
import { isQueryEmpty, type ListingsQuery } from "@/listings/url-state";
import { ListingsCardList } from "./listings-card-list";
import { ListingsEmpty } from "./listings-empty";
import { ListingsError } from "./listings-error";
import { ListingsMap } from "./listings-map";
import { ListingsPagination } from "./listings-pagination";
import { ListingsTable } from "./listings-table";

export async function ListingsResultSlot({
  userId,
  query,
}: {
  userId: string;
  query: ListingsQuery;
}) {
  if (query.view === "map") {
    try {
      const mapResult = await loadMatchedListingsForMap(userId, query);
      if (mapResult.total === 0) {
        return <ListingsEmpty hasActiveFilters={!isQueryEmpty(query)} />;
      }
      return <ListingsMap rows={mapResult.rows} noLocationCount={mapResult.noLocationCount} />;
    } catch {
      return <ListingsError />;
    }
  }

  let result;
  try {
    result = await loadMatchedListings(userId, query);
  } catch {
    return <ListingsError />;
  }

  if (result.rows.length === 0) {
    return <ListingsEmpty hasActiveFilters={!isQueryEmpty(query)} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <ListingsTable rows={result.rows} sort={query.sort} />
      <ListingsCardList rows={result.rows} />
      <ListingsPagination page={result.page} pageCount={result.pageCount} total={result.total} />
    </div>
  );
}
