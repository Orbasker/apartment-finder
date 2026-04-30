"use client";

import type { ReactNode } from "react";
import { activeDirection, nextSort, type SortColumn } from "../_lib/sort-columns";
import { useListingsQuery } from "../_hooks/use-listings-query";

export function ListingsSortButton({
  column,
  children,
}: {
  column: SortColumn;
  children: ReactNode;
}) {
  const { query, setQuery } = useListingsQuery();
  const dir = activeDirection(query.sort, column);

  return (
    <button
      type="button"
      onClick={() => setQuery({ sort: nextSort(query.sort, column) }, { history: "replace" })}
      className="inline-flex items-center gap-1 hover:text-foreground"
    >
      <span>{children}</span>
      <span aria-hidden="true" className="text-xs text-muted-foreground">
        {dir === "asc" ? "▲" : dir === "desc" ? "▼" : "↕"}
      </span>
    </button>
  );
}
