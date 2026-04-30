export type ListingsView = "table" | "map";
export type ListingsSort = "newest" | "priceAsc" | "priceDesc";

export type ListingsQuery = {
  view: ListingsView;
  priceMin: number | null;
  priceMax: number | null;
  rooms: number | null;
  neighborhood: string[];
  sort: ListingsSort;
  page: number;
};

export const DEFAULT_QUERY: ListingsQuery = {
  view: "table",
  priceMin: null,
  priceMax: null,
  rooms: null,
  neighborhood: [],
  sort: "newest",
  page: 1,
};

export const PAGE_SIZE = 20;

const VIEWS: readonly ListingsView[] = ["table", "map"] as const;
const SORTS: readonly ListingsSort[] = ["newest", "priceAsc", "priceDesc"] as const;

type ParamRecord = Record<string, string | string[] | undefined>;
export type ListingsQueryInput = ParamRecord | URLSearchParams;

function firstFromRecord(sp: ParamRecord, key: string): string | undefined {
  const v = sp[key];
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function allFromRecord(sp: ParamRecord, key: string): string[] {
  const v = sp[key];
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function parsePositiveInt(s: string | undefined): number | null {
  if (typeof s !== "string") return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parsePositiveFloat(s: string | undefined): number | null {
  if (typeof s !== "string") return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseEnum<T extends string>(
  s: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return s !== undefined && (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
}

/**
 * Invalid values fall back to defaults; never throws. Accepts both Next 15's
 * awaited searchParams object and a URLSearchParams instance.
 */
export function parseListingsQuery(input: ListingsQueryInput): ListingsQuery {
  const get = (key: string): string | undefined =>
    input instanceof URLSearchParams ? (input.get(key) ?? undefined) : firstFromRecord(input, key);

  const getAll = (key: string): string[] =>
    input instanceof URLSearchParams ? input.getAll(key) : allFromRecord(input, key);

  const view = parseEnum(get("view"), VIEWS, DEFAULT_QUERY.view);
  const sort = parseEnum(get("sort"), SORTS, DEFAULT_QUERY.sort);
  const priceMin = parsePositiveInt(get("priceMin"));
  const priceMax = parsePositiveInt(get("priceMax"));
  const rooms = parsePositiveFloat(get("rooms"));
  const page = parsePositiveInt(get("page")) ?? DEFAULT_QUERY.page;
  const neighborhood = getAll("neighborhood").filter((s) => s.length > 0);

  return { view, priceMin, priceMax, rooms, neighborhood, sort, page };
}

/** Default values are omitted so the canonical empty state is "". */
export function serializeListingsQuery(q: ListingsQuery): URLSearchParams {
  const sp = new URLSearchParams();
  if (q.view !== DEFAULT_QUERY.view) sp.set("view", q.view);
  if (q.sort !== DEFAULT_QUERY.sort) sp.set("sort", q.sort);
  if (q.priceMin !== null) sp.set("priceMin", String(q.priceMin));
  if (q.priceMax !== null) sp.set("priceMax", String(q.priceMax));
  if (q.rooms !== null) sp.set("rooms", String(q.rooms));
  if (q.page !== DEFAULT_QUERY.page) sp.set("page", String(q.page));
  for (const id of q.neighborhood) sp.append("neighborhood", id);
  return sp;
}

export function isQueryEmpty(q: ListingsQuery): boolean {
  return (
    q.priceMin === null &&
    q.priceMax === null &&
    q.rooms === null &&
    q.neighborhood.length === 0 &&
    q.sort === DEFAULT_QUERY.sort
  );
}
