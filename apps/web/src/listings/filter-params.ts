import type { ListingDecision, ListingSource, ListingsFilter } from "./queries";

export type DashboardSearchParams = Record<string, string | string[] | undefined>;

export type ParsedListingFilters = {
  search?: string;
  neighborhood?: string;
  minPriceNis?: number;
  maxPriceNis?: number;
  minRooms?: number;
  maxRooms?: number;
  minScore?: number;
  decision?: ListingDecision;
  source?: ListingSource;
  hoursAgo?: number;
  limit: number;
  cursor?: string;
};

const DEFAULT_LIMIT = 50;
const ALLOWED_LIMITS = new Set([25, 50, 100, 200]);
const ALLOWED_DECISIONS: readonly ListingDecision[] = ["alert", "skip", "unsure"];
const ALLOWED_SOURCES: readonly ListingSource[] = ["yad2", "fb_apify", "fb_ext"];

function one(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function trimmed(value: string | string[] | undefined): string | undefined {
  const v = one(value)?.trim();
  return v ? v : undefined;
}

function asInt(value: string | string[] | undefined): number | undefined {
  const v = one(value);
  if (v == null || v === "") return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

function asFloat(value: string | string[] | undefined): number | undefined {
  const v = one(value);
  if (v == null || v === "") return undefined;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}

export function parseListingFilters(params: DashboardSearchParams): ParsedListingFilters {
  const decisionRaw = one(params.decision);
  const sourceRaw = one(params.source);
  const limitRaw = asInt(params.limit);
  const limit = limitRaw != null && ALLOWED_LIMITS.has(limitRaw) ? limitRaw : DEFAULT_LIMIT;

  return {
    search: trimmed(params.q),
    neighborhood: trimmed(params.neighborhood),
    minPriceNis: asInt(params.minPrice),
    maxPriceNis: asInt(params.maxPrice),
    minRooms: asFloat(params.minRooms),
    maxRooms: asFloat(params.maxRooms),
    minScore: asInt(params.minScore),
    decision: ALLOWED_DECISIONS.find((d) => d === decisionRaw),
    source: ALLOWED_SOURCES.find((s) => s === sourceRaw),
    hoursAgo: asInt(params.hoursAgo),
    limit,
    cursor: trimmed(params.cursor),
  };
}

export function toListingsFilter(f: ParsedListingFilters): ListingsFilter {
  return {
    search: f.search,
    neighborhood: f.neighborhood,
    minPriceNis: f.minPriceNis,
    maxPriceNis: f.maxPriceNis,
    minRooms: f.minRooms,
    maxRooms: f.maxRooms,
    minScore: f.minScore,
    decision: f.decision,
    source: f.source,
    hoursAgo: f.hoursAgo,
    limit: f.limit,
    cursor: f.cursor,
  };
}

export function hasActiveFilters(f: ParsedListingFilters): boolean {
  return Boolean(
    f.search ||
    f.neighborhood ||
    f.minPriceNis != null ||
    f.maxPriceNis != null ||
    f.minRooms != null ||
    f.maxRooms != null ||
    f.minScore != null ||
    f.decision ||
    f.source ||
    f.hoursAgo != null,
  );
}

export function buildFilterQueryString(
  f: ParsedListingFilters,
  overrides: Partial<Record<string, string | undefined>> = {},
): string {
  const qs = new URLSearchParams();
  const set = (key: string, value: string | undefined) => {
    if (value != null && value !== "") qs.set(key, value);
  };

  set("q", f.search);
  set("neighborhood", f.neighborhood);
  set("minPrice", f.minPriceNis?.toString());
  set("maxPrice", f.maxPriceNis?.toString());
  set("minRooms", f.minRooms?.toString());
  set("maxRooms", f.maxRooms?.toString());
  set("minScore", f.minScore?.toString());
  set("decision", f.decision);
  set("source", f.source);
  set("hoursAgo", f.hoursAgo?.toString());
  if (f.limit !== DEFAULT_LIMIT) set("limit", f.limit.toString());

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined || value === "") {
      qs.delete(key);
    } else {
      qs.set(key, value);
    }
  }

  const s = qs.toString();
  return s ? `?${s}` : "";
}
