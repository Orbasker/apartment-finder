import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { geocodeCache } from "../db/schema.js";
import { env } from "../lib/env.js";
import { createLogger, errorMessage } from "../lib/log.js";

const log = createLogger("ingestion:geocode");
const GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json";

export type GeocodeResult = {
  placeId: string | null;
  lat: number | null;
  lon: number | null;
  formattedAddress: string | null;
  street: string | null;
  houseNumber: string | null;
  neighborhood: string | null;
  city: string | null;
  confidence: string | null;
};

const NULL_RESULT: GeocodeResult = {
  placeId: null,
  lat: null,
  lon: null,
  formattedAddress: null,
  street: null,
  houseNumber: null,
  neighborhood: null,
  city: null,
  confidence: null,
};

export function normalizeAddressKey(parts: {
  street?: string | null;
  houseNumber?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  rawAddress?: string | null;
}): string | null {
  const composed =
    parts.rawAddress?.trim() ||
    [parts.street, parts.houseNumber, parts.neighborhood, parts.city]
      .filter((p) => p && p.trim() !== "")
      .join(", ");
  if (!composed) return null;
  return composed.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Geocode an address via Google. Returns null if no API key or no result. */
export async function geocode(addressKey: string): Promise<GeocodeResult> {
  const startedAt = Date.now();
  if (!addressKey) return NULL_RESULT;

  const cached = await readCache(addressKey);
  if (cached) {
    log.info("geocode", {
      result: "cache_hit",
      addressKey,
      ms: Date.now() - startedAt,
    });
    return cached;
  }

  const apiKey = env().GOOGLE_GEOCODING_API_KEY;
  if (!apiKey) {
    log.warn("geocode", {
      result: "no_api_key",
      addressKey,
      ms: Date.now() - startedAt,
    });
    return NULL_RESULT;
  }

  const url = new URL(GEOCODING_URL);
  url.searchParams.set("address", addressKey);
  url.searchParams.set("language", "he");
  url.searchParams.set("region", "il");
  url.searchParams.set("key", apiKey);

  let response: Response;
  try {
    response = await fetch(url, { method: "GET" });
  } catch (err) {
    log.error("geocode", {
      result: "fetch_error",
      addressKey,
      ms: Date.now() - startedAt,
      error: errorMessage(err),
    });
    return NULL_RESULT;
  }

  if (!response.ok) {
    log.warn("geocode", {
      result: "http_error",
      addressKey,
      status: response.status,
      ms: Date.now() - startedAt,
    });
    return NULL_RESULT;
  }

  const json = (await response.json().catch(() => null)) as GoogleGeocodeResponse | null;
  if (!json || json.status !== "OK" || !json.results?.length) {
    log.info("geocode", {
      result: "no_result",
      status: json?.status,
      addressKey,
      ms: Date.now() - startedAt,
    });
    return NULL_RESULT;
  }

  const top = json.results[0]!;
  const result: GeocodeResult = {
    placeId: top.place_id ?? null,
    lat: top.geometry?.location?.lat ?? null,
    lon: top.geometry?.location?.lng ?? null,
    formattedAddress: top.formatted_address ?? null,
    street: pickComponent(top, "route"),
    houseNumber: pickComponent(top, "street_number"),
    neighborhood: pickComponent(top, "neighborhood") ?? pickComponent(top, "sublocality"),
    city: pickComponent(top, "locality"),
    confidence: top.geometry?.location_type ?? null,
  };

  await writeCache(addressKey, result).catch((err) =>
    log.error("geocode cache write failed", { error: errorMessage(err) }),
  );
  log.info("geocode", {
    result: "api_ok",
    addressKey,
    ms: Date.now() - startedAt,
  });
  return result;
}

async function readCache(addressKey: string): Promise<GeocodeResult | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(geocodeCache)
    .where(eq(geocodeCache.addressKey, addressKey))
    .limit(1);
  if (!row) return null;
  return {
    placeId: row.placeId,
    lat: row.lat,
    lon: row.lon,
    formattedAddress: row.formattedAddress,
    street: row.street,
    houseNumber: row.houseNumber,
    neighborhood: row.neighborhood,
    city: row.city,
    confidence: row.confidence,
  };
}

async function writeCache(addressKey: string, result: GeocodeResult): Promise<void> {
  const db = getDb();
  await db
    .insert(geocodeCache)
    .values({ addressKey, ...result })
    .onConflictDoUpdate({
      target: geocodeCache.addressKey,
      set: { ...result, cachedAt: new Date() },
    });
}

type GoogleGeocodeResponse = {
  status: string;
  results: Array<{
    place_id?: string;
    formatted_address?: string;
    address_components?: Array<{
      long_name?: string;
      short_name?: string;
      types?: string[];
    }>;
    geometry?: {
      location?: { lat?: number; lng?: number };
      location_type?: string;
    };
  }>;
};

function pickComponent(
  result: GoogleGeocodeResponse["results"][number],
  type: string,
): string | null {
  const comp = result.address_components?.find((c) => c.types?.includes(type));
  return comp?.long_name ?? comp?.short_name ?? null;
}
