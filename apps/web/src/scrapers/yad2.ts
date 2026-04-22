import type { NormalizedListing } from "@apartment-finder/shared";

// Matches https://www.yad2.co.il/realestate/rent/tel-aviv-area
// region=3 → "תל אביב והסביבה" (Tel Aviv & surroundings)
// property=1 → apartments
const YAD2_FEED_URL =
  "https://gw.yad2.co.il/realestate-feed/rent/map?region=3&property=1";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

type Yad2RawItem = {
  orderId?: string | number;
  token?: string;
  price?: number;
  adType?: string;
  address?: {
    city?: { text?: string };
    neighborhood?: { text?: string };
    street?: { text?: string };
    house?: { floor?: number; number?: number };
  };
  additionalDetails?: {
    roomsCount?: number;
    squareMeter?: number;
    property?: { text?: string };
  };
};

type Yad2Response = {
  data?: {
    markers?: Yad2RawItem[];
  };
  message?: string;
};

export type Yad2FetchOptions = {
  /** Override the default Yad2 feed URL (e.g., for a different region or filter). */
  feedUrl?: string;
  /** Abort after N ms. */
  timeoutMs?: number;
};

export async function fetchYad2Listings(
  opts: Yad2FetchOptions = {},
): Promise<NormalizedListing[]> {
  const url = opts.feedUrl ?? YAD2_FEED_URL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "he-IL,he;q=0.9,en;q=0.8",
        Referer: "https://www.yad2.co.il/",
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Yad2 feed returned ${res.status} ${res.statusText}`);
    }

    const json = (await res.json()) as Yad2Response;
    if (json.message && json.message !== "OK") {
      throw new Error(`Yad2 feed error: ${json.message}`);
    }
    const items: Yad2RawItem[] = json.data?.markers ?? [];

    return items.map(normalizeYad2Item).filter((l): l is NormalizedListing => l !== null);
  } finally {
    clearTimeout(timeout);
  }
}

export function normalizeYad2Item(raw: Yad2RawItem): NormalizedListing | null {
  // token is the stable item slug used in item URLs; orderId is secondary.
  const token = raw.token ? String(raw.token).trim() : "";
  const orderId = raw.orderId != null ? String(raw.orderId).trim() : "";
  const sourceId = token || orderId;
  if (!sourceId) return null;

  const listingUrl = token
    ? `https://www.yad2.co.il/realestate/item/${token}`
    : `https://www.yad2.co.il/item/${orderId}`;

  return {
    source: "yad2",
    sourceId,
    url: listingUrl,
    title: null,
    description: null,
    priceNis: typeof raw.price === "number" ? raw.price : null,
    rooms: raw.additionalDetails?.roomsCount ?? null,
    sqm: raw.additionalDetails?.squareMeter ?? null,
    floor: raw.address?.house?.floor ?? null,
    neighborhood: raw.address?.neighborhood?.text ?? null,
    street: raw.address?.street?.text ?? null,
    postedAt: null,
    isAgency: raw.adType === "agency" ? true : raw.adType === "private" ? false : null,
    authorName: null,
    authorProfile: null,
    rawJson: raw,
  };
}
