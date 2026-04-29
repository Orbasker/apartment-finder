import { env } from "@/lib/env";
import { createLogger, errorMessage } from "@/lib/log";

// Thin wrapper over Places API (New). One key (GOOGLE_GEOCODING_API_KEY) covers
// Geocoding + Places once Places API (New) is enabled on the same project.
//
// Docs:
//   https://developers.google.com/maps/documentation/places/web-service/op-overview

const PLACES_BASE = "https://places.googleapis.com/v1";
const log = createLogger("googlePlaces");

export type CityCandidate = {
  placeId: string;
  nameHe: string;
};

export type NeighborhoodCandidate = {
  placeId: string;
  nameHe: string;
  cityNameHe: string;
};

class PlacesError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "PlacesError";
  }
}

async function placesFetch<T>(
  path: string,
  body: Record<string, unknown>,
  fieldMask: string,
): Promise<T> {
  const res = await fetch(`${PLACES_BASE}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": env().GOOGLE_GEOCODING_API_KEY ?? "",
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new PlacesError(`Places ${path} ${res.status}: ${text.slice(0, 200)}`, res.status);
  }
  return JSON.parse(text) as T;
}

/** Autocomplete cities in Israel for typed input. Returns up to 5. */
export async function autocompleteCities(query: string): Promise<CityCandidate[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  try {
    const data = await placesFetch<{
      suggestions?: Array<{
        placePrediction?: {
          placeId: string;
          structuredFormat?: { mainText?: { text?: string } };
          text?: { text?: string };
        };
      }>;
    }>(
      "/places:autocomplete",
      {
        input: trimmed,
        includedPrimaryTypes: ["locality"],
        languageCode: "iw",
        regionCode: "IL",
      },
      "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat",
    );
    return (data.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> => Boolean(p?.placeId))
      .map((p) => ({
        placeId: p.placeId,
        nameHe: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
      }))
      .filter((c) => c.nameHe.length > 0);
  } catch (err) {
    log.warn("autocompleteCities failed", { error: errorMessage(err) });
    return [];
  }
}

/** Autocomplete neighborhoods. If `cityNameHe` is given, the query is biased
 *  textually so Google scopes results to that city. Returns up to 5. */
export async function autocompleteNeighborhoods(
  query: string,
  cityNameHe?: string | null,
): Promise<NeighborhoodCandidate[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const input = cityNameHe ? `${trimmed} ${cityNameHe}` : trimmed;
  try {
    const data = await placesFetch<{
      suggestions?: Array<{
        placePrediction?: {
          placeId: string;
          structuredFormat?: {
            mainText?: { text?: string };
            secondaryText?: { text?: string };
          };
        };
      }>;
    }>(
      "/places:autocomplete",
      {
        input,
        includedPrimaryTypes: ["neighborhood", "sublocality"],
        languageCode: "iw",
        regionCode: "IL",
      },
      "suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat",
    );
    return (data.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> => Boolean(p?.placeId))
      .map((p) => ({
        placeId: p.placeId,
        nameHe: p.structuredFormat?.mainText?.text ?? "",
        cityNameHe: p.structuredFormat?.secondaryText?.text ?? cityNameHe ?? "",
      }))
      .filter((c) => c.nameHe.length > 0);
  } catch (err) {
    log.warn("autocompleteNeighborhoods failed", { error: errorMessage(err) });
    return [];
  }
}

/** Browse mode: list neighborhoods within a city without typing. Powers chip
 *  display when the user says "I don't know names". Returns up to 20.
 *
 *  Places Text Search (New) doesn't accept `includedType: "neighborhood"`
 *  (only a narrower POI list is supported), so we omit it and filter
 *  client-side on the `types` array. */
export async function listNeighborhoodsInCity(
  cityNameHe: string,
): Promise<NeighborhoodCandidate[]> {
  const cityTrimmed = cityNameHe.trim();
  if (!cityTrimmed) return [];
  try {
    const data = await placesFetch<{
      places?: Array<{
        id?: string;
        displayName?: { text?: string };
        types?: string[];
        addressComponents?: Array<{ longText?: string; types?: string[] }>;
      }>;
    }>(
      "/places:searchText",
      {
        textQuery: `שכונות ב${cityTrimmed}`,
        languageCode: "iw",
        regionCode: "IL",
        pageSize: 20,
      },
      "places.id,places.displayName,places.types,places.addressComponents",
    );
    return (data.places ?? [])
      .filter((p) => p.types?.includes("neighborhood"))
      .map((p) => {
        const cityFromComponents =
          p.addressComponents?.find((c) => c.types?.includes("locality"))?.longText ?? cityTrimmed;
        return {
          placeId: p.id ?? "",
          nameHe: p.displayName?.text ?? "",
          cityNameHe: cityFromComponents,
        };
      })
      .filter((c) => c.placeId && c.nameHe);
  } catch (err) {
    log.warn("listNeighborhoodsInCity failed", { error: errorMessage(err) });
    return [];
  }
}
