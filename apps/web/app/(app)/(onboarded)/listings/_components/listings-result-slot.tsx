import { loadMatchedListings } from "@/listings/store";
import { isQueryEmpty, type ListingsQuery } from "@/listings/url-state";
import { ListingsEmpty } from "./listings-empty";
import { ListingsError } from "./listings-error";

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
