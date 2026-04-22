import type { NormalizedListing } from "@apartment-finder/shared";

const YAD2_FEED_URL =
  "https://gw.yad2.co.il/realestate-feed/rent/map?propertyGroup=apartments&topArea=25&area=1&city=5000";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

type Yad2RawItem = {
  orderId?: string | number;
  token?: string;
  adNumber?: string | number;
  price?: number;
  address?: {
    city?: { text?: string };
    neighborhood?: { text?: string };
    street?: { text?: string };
    house?: { floor?: number };
  };
  additionalDetails?: {
    roomsCount?: number;
    squareMeter?: number;
    property?: { text?: string };
  };
  metaData?: {
    images?: string[];
  };
  customer?: {
    agencyName?: string | null;
    agentName?: string | null;
  };
  dates?: {
    createdAt?: string;
    updatedAt?: string;
  };
  description?: string;
  title?: string;
};

type Yad2Response = {
  data?: {
    markers?: Yad2RawItem[];
    feed?: { feed_items?: Yad2RawItem[] };
  };
};

export type Yad2FetchOptions = {
  /** Override the default Yad2 feed URL (e.g., for a different city or filter). */
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
    const items: Yad2RawItem[] =
      json.data?.markers ?? json.data?.feed?.feed_items ?? [];

    return items.map(normalizeYad2Item).filter((l): l is NormalizedListing => l !== null);
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeYad2Item(raw: Yad2RawItem): NormalizedListing | null {
  const sourceId = String(raw.orderId ?? raw.token ?? raw.adNumber ?? "").trim();
  if (!sourceId) return null;

  const listingUrl = `https://www.yad2.co.il/item/${sourceId}`;
  const neighborhood = raw.address?.neighborhood?.text ?? null;
  const street = raw.address?.street?.text ?? null;
  const floor = raw.address?.house?.floor ?? null;
  const rooms = raw.additionalDetails?.roomsCount ?? null;
  const sqm = raw.additionalDetails?.squareMeter ?? null;
  const isAgency = Boolean(raw.customer?.agencyName);
  const postedAt = raw.dates?.createdAt ? new Date(raw.dates.createdAt) : null;

  return {
    source: "yad2",
    sourceId,
    url: listingUrl,
    title: raw.title ?? null,
    description: raw.description ?? null,
    priceNis: typeof raw.price === "number" ? raw.price : null,
    rooms,
    sqm,
    floor,
    neighborhood,
    street,
    postedAt,
    isAgency,
    authorName: raw.customer?.agencyName ?? raw.customer?.agentName ?? null,
    authorProfile: null,
    rawJson: raw,
  };
}
