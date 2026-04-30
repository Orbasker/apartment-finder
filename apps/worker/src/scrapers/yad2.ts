import { createLogger, errorMessage } from "../lib/log.js";

/**
 * Rich Yad2 listing shape returned by the scraper. Pre-extracted structured
 * fields ride along; PR3's ingestion writes them straight into
 * `listing_extractions` without re-running the AI for Yad2 sources.
 */
export type Yad2Listing = {
  source: "yad2";
  sourceId: string;
  url: string;
  title: string | null;
  description: string | null;
  priceNis: number | null;
  rooms: number | null;
  sqm: number | null;
  floor: number | null;
  neighborhood: string | null;
  street: string | null;
  postedAt: Date | null;
  isAgency: boolean | null;
  authorName: string | null;
  authorProfile: string | null;
  rawJson: unknown;
};

const log = createLogger("scraper:yad2");

// Matches https://www.yad2.co.il/realestate/rent/tel-aviv-area
// region=3 → "תל אביב והסביבה" (Tel Aviv & surroundings)
// property=1 → apartments
const YAD2_FEED_URL = "https://gw.yad2.co.il/realestate-feed/rent/map?region=3&property=1";

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
  /** Override fetch for tests. */
  fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
};

export class Yad2UpstreamUnavailableError extends Error {
  readonly status: number;
  readonly contentType: string | null;
  readonly bodyPreview: string;

  constructor(
    message: string,
    opts: {
      status: number;
      contentType: string | null;
      bodyPreview: string;
      cause?: unknown;
    },
  ) {
    super(message, opts.cause ? { cause: opts.cause } : undefined);
    this.name = "Yad2UpstreamUnavailableError";
    this.status = opts.status;
    this.contentType = opts.contentType;
    this.bodyPreview = opts.bodyPreview;
  }
}

export async function fetchYad2Listings(opts: Yad2FetchOptions = {}): Promise<Yad2Listing[]> {
  const url = opts.feedUrl ?? YAD2_FEED_URL;
  const fetchImpl = opts.fetchImpl ?? buildDefaultYad2Fetch();
  const proxied = Boolean(process.env.YAD2_PROXY_URL && process.env.YAD2_PROXY_SECRET);
  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  log.info("fetch starting", { proxied, timeoutMs });

  try {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        headers: {
          "User-Agent": UA,
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "he-IL,he;q=0.9,en;q=0.8",
          Referer: "https://www.yad2.co.il/",
          Origin: "https://www.yad2.co.il",
        },
        signal: controller.signal,
      });
    } catch (cause) {
      const err = buildFetchFailureError(cause, timeoutMs);
      log.error("fetch failed", {
        proxied,
        durationMs: Date.now() - startedAt,
        error: errorMessage(cause),
      });
      throw err;
    }

    const rawText = await res.text();

    if (!res.ok) {
      log.warn("upstream not ok", {
        status: res.status,
        contentType: res.headers.get("content-type"),
        bytes: rawText.length,
        durationMs: Date.now() - startedAt,
      });
      throw new Yad2UpstreamUnavailableError(
        `Yad2 feed returned ${res.status} ${res.statusText}${formatResponseDetails(rawText, res)}`,
        {
          status: res.status,
          contentType: res.headers.get("content-type"),
          bodyPreview: buildBodyPreview(rawText),
        },
      );
    }

    const json = parseYad2Response(rawText, res);
    if (json.message && json.message !== "OK") {
      log.error("upstream message not ok", { message: json.message });
      throw new Error(`Yad2 feed error: ${json.message}`);
    }
    const items: Yad2RawItem[] = json.data?.markers ?? [];
    const normalized = items.map(normalizeYad2Item).filter((l): l is Yad2Listing => l !== null);

    log.info("fetch ok", {
      rawItems: items.length,
      normalized: normalized.length,
      dropped: items.length - normalized.length,
      bytes: rawText.length,
      durationMs: Date.now() - startedAt,
    });
    return normalized;
  } finally {
    clearTimeout(timeout);
  }
}

function parseYad2Response(rawText: string, res: Response): Yad2Response {
  try {
    return JSON.parse(rawText) as Yad2Response;
  } catch (cause) {
    throw new Yad2UpstreamUnavailableError(
      `Yad2 feed returned a non-JSON response${formatResponseDetails(rawText, res)}`,
      {
        status: res.status,
        contentType: res.headers.get("content-type"),
        bodyPreview: buildBodyPreview(rawText),
        cause,
      },
    );
  }
}

function buildFetchFailureError(cause: unknown, timeoutMs: number): Yad2UpstreamUnavailableError {
  const aborted = cause instanceof DOMException && cause.name === "AbortError";

  return new Yad2UpstreamUnavailableError(
    aborted
      ? `Yad2 feed request timed out after ${timeoutMs}ms`
      : `Yad2 feed request failed: ${formatCauseMessage(cause)}`,
    {
      status: 0,
      contentType: null,
      bodyPreview: "",
      cause,
    },
  );
}

function formatCauseMessage(cause: unknown): string {
  if (cause instanceof Error && cause.message) return cause.message;
  return String(cause);
}

function formatResponseDetails(rawText: string, res: Response): string {
  const details = [`status=${res.status}`];
  const contentType = res.headers.get("content-type");
  if (contentType) {
    details.push(`content-type=${contentType.split(";")[0]}`);
  }

  const title = rawText.match(/<title[^>]*>\s*([^<]+?)\s*<\/title>/i)?.[1]?.trim();
  if (title) {
    details.push(`title="${title}"`);
  }

  const preview = buildBodyPreview(rawText);
  if (preview) {
    details.push(`body="${preview}"`);
  }

  return ` (${details.join(", ")})`;
}

function buildBodyPreview(rawText: string): string {
  return rawText.replace(/\s+/g, " ").trim().slice(0, 140);
}

/**
 * When `YAD2_PROXY_URL` + `YAD2_PROXY_SECRET` are set, route Yad2 fetches
 * through a Cloud Run proxy in me-west1 so Yad2 sees an Israeli egress IP.
 * Vercel's serverless regions are outside Israel and Yad2 blocks them.
 */
export function buildDefaultYad2Fetch(): (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response> {
  const proxyUrl = process.env.YAD2_PROXY_URL?.replace(/\/$/, "");
  const proxySecret = process.env.YAD2_PROXY_SECRET;
  if (!proxyUrl || !proxySecret) return fetch;

  return async (input, init) => {
    const target = typeof input === "string" ? input : input.toString();
    const proxied = `${proxyUrl}/fetch?url=${encodeURIComponent(target)}`;
    return fetch(proxied, {
      method: init?.method ?? "GET",
      headers: { "x-proxy-secret": proxySecret },
      signal: init?.signal,
    });
  };
}

export function normalizeYad2Item(raw: Yad2RawItem): Yad2Listing | null {
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
