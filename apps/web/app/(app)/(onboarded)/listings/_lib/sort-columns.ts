import type { ListingsSort } from "@/listings/url-state";

export type SortColumn = "postedAt" | "price" | "rooms";

const COLUMN_SORTS: Record<SortColumn, { asc: ListingsSort; desc: ListingsSort }> = {
  postedAt: { asc: "oldest", desc: "newest" },
  price: { asc: "priceAsc", desc: "priceDesc" },
  rooms: { asc: "roomsAsc", desc: "roomsDesc" },
};

export function activeDirection(sort: ListingsSort, column: SortColumn): "asc" | "desc" | null {
  const { asc, desc } = COLUMN_SORTS[column];
  if (sort === asc) return "asc";
  if (sort === desc) return "desc";
  return null;
}

export function nextSort(current: ListingsSort, column: SortColumn): ListingsSort {
  const { asc, desc } = COLUMN_SORTS[column];
  // Toggle direction when already on this column; otherwise jump to the
  // column's primary direction. postedAt defaults to desc (most recent first
  // matches the global default); numeric columns default to asc.
  if (current === asc) return desc;
  if (current === desc) return asc;
  return column === "postedAt" ? desc : asc;
}
