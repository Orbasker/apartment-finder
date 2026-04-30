"use client";

import { useCallback, useMemo, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  parseListingsQuery,
  serializeListingsQuery,
  DEFAULT_QUERY,
  type ListingsQuery,
} from "@/listings/url-state";

type Patch = Partial<ListingsQuery>;

type UpdateOptions = {
  /** push (history entry) vs replace (no history). Default: replace. */
  history?: "push" | "replace";
  /** Reset page to 1 on this update. Default: true unless caller passed page. */
  resetPage?: boolean;
};

export function useListingsQuery(): {
  query: ListingsQuery;
  isPending: boolean;
  setQuery: (patch: Patch, opts?: UpdateOptions) => void;
  clearAll: () => void;
} {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const query = useMemo<ListingsQuery>(() => {
    const record: Record<string, string | string[]> = {};
    for (const key of searchParams.keys()) {
      const all = searchParams.getAll(key);
      record[key] = all.length > 1 ? all : (all[0] ?? "");
    }
    return parseListingsQuery(record);
  }, [searchParams]);

  const setQuery = useCallback(
    (patch: Patch, opts: UpdateOptions = {}) => {
      const next: ListingsQuery = {
        ...query,
        ...patch,
        page:
          opts.resetPage === false || patch.page !== undefined
            ? (patch.page ?? query.page)
            : 1,
      };
      const qs = serializeListingsQuery(next);
      const href = qs.toString().length > 0 ? `/listings?${qs.toString()}` : "/listings";
      const action = opts.history === "push" ? router.push : router.replace;
      startTransition(() => {
        action(href, { scroll: false });
      });
    },
    [query, router],
  );

  const clearAll = useCallback(() => {
    startTransition(() => {
      router.push("/listings", { scroll: false });
    });
  }, [router]);

  return { query, isPending, setQuery, clearAll };
}

export { DEFAULT_QUERY };
