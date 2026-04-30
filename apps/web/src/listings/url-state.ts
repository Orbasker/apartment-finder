export type ListingsView = "table" | "map";
export type ListingsSort =
  | "newest"
  | "oldest"
  | "priceAsc"
  | "priceDesc"
  | "roomsAsc"
  | "roomsDesc";

export type ListingsQuery = {
  view: ListingsView;
  priceMin: number | null;
  priceMax: number | null;
  rooms: number | null;
  neighborhood: string[];
  sort: ListingsSort;
  page: number;
  lat: number | null;
  lng: number | null;
  zoom: number | null;
};

export const DEFAULT_QUERY: ListingsQuery = {
  view: "table",
  priceMin: null,
  priceMax: null,
  rooms: null,
  neighborhood: [],
  sort: "newest",
  page: 1,
  lat: null,
  lng: null,
  zoom: null,
};

export const PAGE_SIZE = 20;

const VIEWS: readonly ListingsView[] = ["table", "map"] as const;
const SORTS: readonly ListingsSort[] = [
  "newest",
  "oldest",
  "priceAsc",
  "priceDesc",
  "roomsAsc",
  "roomsDesc",
] as const;

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

function parseRangeFloat(s: string | undefined, min: number, max: number): number | null {
  if (typeof s !== "string") return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function parseEnum<T extends string>(s: string | undefined, allowed: readonly T[], fallback: T): T {
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
  const lat = parseRangeFloat(get("lat"), -90, 90);
  const lng = parseRangeFloat(get("lng"), -180, 180);
  const zoom = parseRangeFloat(get("zoom"), 0, 22);

  return { view, priceMin, priceMax, rooms, neighborhood, sort, page, lat, lng, zoom };
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
  if (q.lat !== null) sp.set("lat", String(q.lat));
  if (q.lng !== null) sp.set("lng", String(q.lng));
  if (q.zoom !== null) sp.set("zoom", String(q.zoom));
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
