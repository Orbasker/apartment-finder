import { loadMatchedListings } from "@/listings/store";
import { isQueryEmpty, type ListingsQuery } from "@/listings/url-state";
import { ListingsEmpty } from "./listings-empty";
import { ListingsError } from "./listings-error";

/**
 * Server component that fetches data and decides which view to render.
 * APA-30 will replace the inline `<ul>` with the table/map components;
 * we keep the data shape stable so they can drop in.
 */
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

  // Phase-1-of-APA-30: render a debug list. APA-30 sub-issues replace this.
  return (
    <ul
      className="divide-y rounded-md border bg-background text-sm"
      aria-label="Listings"
    >
      {result.rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3 p-3">
          <div>
            <div className="font-medium">
              <bdi>{r.formattedAddress ?? "—"}</bdi>
            </div>
            <div className="text-xs text-muted-foreground">
              <bdi>
                {[
                  r.priceNis != null ? `₪${r.priceNis.toLocaleString("he-IL")}` : null,
                  r.rooms != null ? `${r.rooms} חד׳` : null,
                  r.neighborhood,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </bdi>
            </div>
          </div>
          <a className="text-xs text-primary underline" href={`/listings/${r.id}`}>
            פתח
          </a>
        </li>
      ))}
    </ul>
  );
}
