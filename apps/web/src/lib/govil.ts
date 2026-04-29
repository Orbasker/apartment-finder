import { env } from "@/lib/env";

// ---------------------------------------------------------------------------
// Thin client over the data.gov.il CKAN API. Used by the neighborhoods seed
// job and weekly refresh cron to pull canonical Israeli neighborhood rows.
//
// CKAN API reference: https://docs.ckan.org/en/latest/api/
//   - GET /api/3/action/package_show?id=<slug>      → list resources in a dataset
//   - GET /api/3/action/datastore_search?resource_id=<UUID>&offset=N&limit=M
//                                                    → row-level data with pagination
// ---------------------------------------------------------------------------

export type CkanResource = {
  id: string;
  name?: string | null;
  format?: string | null;
};

export type CkanPackage = {
  id: string;
  name: string;
  title?: string | null;
  resources: CkanResource[];
};

export type CkanFieldDescriptor = {
  id: string;
  type?: string;
  info?: { label?: string; notes?: string } | null;
};

export type CkanDatastoreResult = {
  fields: CkanFieldDescriptor[];
  records: Array<Record<string, unknown>>;
  total: number;
};

class CkanError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = "CkanError";
  }
}

async function ckanFetch<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const base = env().NEIGHBORHOODS_CKAN_BASE.replace(/\/$/, "");
  const url = new URL(`${base}/api/3/action/${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { headers: { accept: "application/json" } });
  const text = await res.text();
  if (!res.ok) {
    throw new CkanError(`CKAN ${path} ${res.status}`, res.status, text);
  }
  let parsed: { success: boolean; result?: unknown; error?: { message?: string } };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    throw new CkanError(`CKAN ${path}: non-JSON response`, res.status, text);
  }
  if (!parsed.success) {
    throw new CkanError(
      `CKAN ${path}: ${parsed.error?.message ?? "unknown error"}`,
      res.status,
      text,
    );
  }
  return parsed.result as T;
}

export async function fetchPackage(slug: string): Promise<CkanPackage> {
  return ckanFetch<CkanPackage>("package_show", { id: slug });
}

/** One page of `datastore_search` results. */
export async function fetchResourcePage(
  resourceId: string,
  offset = 0,
  limit?: number,
): Promise<CkanDatastoreResult> {
  return ckanFetch<CkanDatastoreResult>("datastore_search", {
    resource_id: resourceId,
    offset,
    limit: limit ?? env().NEIGHBORHOODS_CKAN_PAGE_SIZE,
  });
}

/** Pulls every row from a CKAN datastore resource via paginated requests. */
export async function* iterateResourceRows(
  resourceId: string,
): AsyncGenerator<Record<string, unknown>, void, unknown> {
  const pageSize = env().NEIGHBORHOODS_CKAN_PAGE_SIZE;
  let offset = 0;
  for (;;) {
    const page = await fetchResourcePage(resourceId, offset, pageSize);
    if (page.records.length === 0) return;
    for (const row of page.records) yield row;
    offset += page.records.length;
    if (offset >= page.total) return;
  }
}

// ---------------------------------------------------------------------------
// Field detection / normalization. data.gov.il datasets are heterogeneous:
// each resource picks its own column names (Hebrew, English, mixed-case).
// We probe the first row for likely candidates and normalize to our shape.
// ---------------------------------------------------------------------------

const NAME_HE_KEYS = ["שם_שכונה", "שם שכונה", "name_he", "neighborhood_name", "name"];
const NAME_EN_KEYS = ["name_en", "neighborhood_name_en", "english_name"];
const CITY_NAME_HE_KEYS = ["שם_ישוב", "שם ישוב", "city", "city_he", "locality"];
const CITY_CODE_KEYS = ["סמל_ישוב", "סמל ישוב", "city_code", "locality_code", "yishuv_code"];
const NEIGHBORHOOD_CODE_KEYS = [
  "סמל_שכונה",
  "סמל שכונה",
  "neighborhood_code",
  "shchuna_code",
  "code",
];
const LAT_KEYS = ["lat", "latitude", "y", "center_lat"];
const LON_KEYS = ["lon", "lng", "longitude", "x", "center_lon"];

function pick(row: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const k of keys) {
    if (k in row) {
      const v = row[k];
      if (v == null) continue;
      const s = String(v).trim();
      if (s !== "") return s;
    }
  }
  return null;
}

function pickNumber(row: Record<string, unknown>, keys: readonly string[]): number | null {
  const s = pick(row, keys);
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function slugifyId(cityCode: string, nameHe: string): string {
  // Stable surrogate when the dataset has no neighborhood code column.
  const compact = nameHe.normalize("NFC").replace(/\s+/g, "_");
  return `${cityCode}-${compact}`;
}

export type NormalizedNeighborhood = {
  id: string;
  cityCode: string;
  cityNameHe: string;
  nameHe: string;
  nameEn: string | null;
  centerLat: number | null;
  centerLon: number | null;
};

/** Map a raw CKAN row into our `neighborhoods` shape. Returns null if a row
 *  lacks the minimum required fields (cityCode / cityNameHe / nameHe). */
export function normalizeNeighborhoodRow(
  row: Record<string, unknown>,
): NormalizedNeighborhood | null {
  const cityCode = pick(row, CITY_CODE_KEYS);
  const cityNameHe = pick(row, CITY_NAME_HE_KEYS);
  const nameHe = pick(row, NAME_HE_KEYS);
  if (!cityCode || !cityNameHe || !nameHe) return null;

  const explicitId = pick(row, NEIGHBORHOOD_CODE_KEYS);
  const id = explicitId ?? slugifyId(cityCode, nameHe);
  const nameEn = pick(row, NAME_EN_KEYS);
  const centerLat = pickNumber(row, LAT_KEYS);
  const centerLon = pickNumber(row, LON_KEYS);

  return { id, cityCode, cityNameHe, nameHe, nameEn, centerLat, centerLon };
}
