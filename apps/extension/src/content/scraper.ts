import type { ExtensionScrapedPost } from "@apartment-finder/shared";

export type RawPost = {
  text: string;
  permalink: string | null;
  authorName: string | null;
  authorUrl: string | null;
  timestampIso: string | null;
  groupUrl: string | null;
  groupName: string | null;
};

const POST_URL_RE =
  /\/(?:groups\/[^/]+\/(?:posts|permalink)\/[A-Za-z0-9]+|permalink\.php\?story_fbid=[A-Za-z0-9]+|[^/]+\/posts\/[A-Za-z0-9_.-]+)/i;

const POST_ID_RE = /(?:posts|permalink|story_fbid=)\/?([A-Za-z0-9]+)/i;

export function extractPostIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url, "https://www.facebook.com");
    const fbid = u.searchParams.get("story_fbid");
    if (fbid && /^\d+$/.test(fbid)) return fbid;
    const m = POST_ID_RE.exec(u.pathname + u.search);
    if (m?.[1]) return m[1];
    const parts = u.pathname.split("/").filter(Boolean);
    const last = parts.at(-1) ?? null;
    return last && last.length >= 6 ? last : null;
  } catch {
    return null;
  }
}

export function normalizePermalink(url: string): string | null {
  try {
    const u = new URL(url, "https://www.facebook.com");
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (key !== "story_fbid" && key !== "id") u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return null;
  }
}

export function parseRawPost(
  raw: RawPost,
  now: Date = new Date(),
): ExtensionScrapedPost | null {
  const text = raw.text.trim();
  if (text.length < 20) return null;

  const permalink = raw.permalink ? normalizePermalink(raw.permalink) : null;
  if (!permalink) return null;

  if (!POST_URL_RE.test(permalink)) return null;

  const postId = extractPostIdFromUrl(permalink);
  if (!postId) return null;

  const timestampIso = raw.timestampIso ?? null;
  if (timestampIso && Number.isNaN(Date.parse(timestampIso))) {
    return null;
  }

  return {
    postId,
    permalink,
    groupUrl: raw.groupUrl ?? null,
    groupName: raw.groupName ?? null,
    text,
    authorName: raw.authorName ?? null,
    authorUrl: raw.authorUrl ?? null,
    timestampIso,
    scrapedAt: now.toISOString(),
  };
}

export function extractPostsFromDocument(doc: Document): RawPost[] {
  const groupUrl = extractGroupUrl(doc);
  const groupName = extractGroupName(doc);
  const articles = findPostContainers(doc);
  const out: RawPost[] = [];

  for (const article of articles) {
    const text = extractPostText(article);
    if (!text) continue;

    const permalink = extractPermalink(article);
    const { authorName, authorUrl } = extractAuthor(article);
    const timestampIso = extractTimestampIso(article);

    out.push({
      text,
      permalink,
      authorName,
      authorUrl,
      timestampIso,
      groupUrl,
      groupName,
    });
  }

  return out;
}

function findPostContainers(doc: Document): HTMLElement[] {
  const primary = Array.from(
    doc.querySelectorAll<HTMLElement>('[role="article"]'),
  );
  if (primary.length > 0) return primary;

  const posinset = Array.from(
    doc.querySelectorAll<HTMLElement>("[aria-posinset]"),
  );
  if (posinset.length > 0) return posinset;

  const seen = new Set<HTMLElement>();
  const out: HTMLElement[] = [];
  const links = doc.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/posts/"], a[href*="/permalink/"], a[href*="story_fbid="]',
  );
  for (const a of links) {
    const container = climbToContainer(a);
    if (container && !seen.has(container)) {
      seen.add(container);
      out.push(container);
    }
  }
  return out;
}

function climbToContainer(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el;
  for (let i = 0; i < 12 && node; i++) {
    const text = (node.innerText ?? "").trim();
    if (text.length > 80) return node;
    node = node.parentElement;
  }
  return null;
}

function extractPostText(article: HTMLElement): string {
  const body =
    article.querySelector<HTMLElement>('[data-ad-preview="message"]') ??
    article.querySelector<HTMLElement>('[data-ad-comet-preview="message"]') ??
    article.querySelector<HTMLElement>('div[dir="auto"]');
  const text = (body?.innerText ?? article.innerText ?? "").trim();
  return text;
}

function extractPermalink(article: HTMLElement): string | null {
  const links = Array.from(article.querySelectorAll<HTMLAnchorElement>("a[href]"));
  for (const a of links) {
    const href = a.getAttribute("href") ?? "";
    if (POST_URL_RE.test(href)) {
      return absoluteUrl(href);
    }
  }
  return null;
}

function extractAuthor(
  article: HTMLElement,
): { authorName: string | null; authorUrl: string | null } {
  const strong = article.querySelector<HTMLElement>("h2 a, h3 a, h4 a, strong a");
  const name = strong?.innerText?.trim() ?? null;
  const href = strong?.getAttribute("href") ?? null;
  return {
    authorName: name,
    authorUrl: href ? absoluteUrl(href) : null,
  };
}

function extractTimestampIso(article: HTMLElement): string | null {
  const abbr = article.querySelector<HTMLElement>("abbr[data-utime]");
  const utime = abbr?.getAttribute("data-utime");
  if (utime && /^\d+$/.test(utime)) {
    return new Date(Number(utime) * 1000).toISOString();
  }
  const time = article.querySelector<HTMLTimeElement>("time[datetime]");
  const dt = time?.getAttribute("datetime");
  if (dt && !Number.isNaN(Date.parse(dt))) {
    return new Date(dt).toISOString();
  }
  return null;
}

function extractGroupUrl(doc: Document): string | null {
  const m = /\/groups\/[^/]+\//.exec(doc.location.pathname);
  if (!m) return null;
  return `${doc.location.origin}${m[0]}`;
}

function extractGroupName(doc: Document): string | null {
  const el = doc.querySelector<HTMLElement>("h1");
  return el?.innerText?.trim() ?? null;
}

function absoluteUrl(href: string): string {
  try {
    return new URL(href, "https://www.facebook.com").toString();
  } catch {
    return href;
  }
}

const WUI_TIMESTAMP_RE = /(?:\b\d+\s*[hmdswy]\b|לפני\s+\d+)/i;

export function extractWuiPostsFromDocument(doc: Document): RawPost[] {
  const groupUrl = extractGroupUrl(doc) ?? doc.location.href;
  const groupName = extractGroupName(doc);
  const containers = findWuiPostContainers(doc);
  const seen = new Set<string>();
  const out: RawPost[] = [];
  for (const el of containers) {
    const text = cleanWuiText(el.innerText ?? "");
    if (text.length < 40) continue;
    const key = text.slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      text,
      permalink: null,
      authorName: guessAuthor(text),
      authorUrl: null,
      timestampIso: null,
      groupUrl,
      groupName,
    });
  }
  return out;
}

function findWuiPostContainers(doc: Document): HTMLElement[] {
  const all = Array.from(doc.querySelectorAll<HTMLElement>("div"));
  const matches: HTMLElement[] = [];
  for (const el of all) {
    const t = (el.innerText ?? "").trim();
    if (t.length < 120 || t.length > 4000) continue;
    if (!WUI_TIMESTAMP_RE.test(t)) continue;
    matches.push(el);
  }
  const result: HTMLElement[] = [];
  for (const el of matches) {
    let isInnermost = true;
    for (const other of matches) {
      if (other !== el && el.contains(other)) {
        isInnermost = false;
        break;
      }
    }
    if (isInnermost) result.push(el);
  }
  return result;
}

function cleanWuiText(raw: string): string {
  return raw
    .replace(/[\u{E000}-\u{F8FF}\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/gu, " ")
    .replace(/\u200E|\u200F|\u202A|\u202B|\u202C|\u202D|\u202E/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function guessAuthor(text: string): string | null {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 5)) {
    if (WUI_TIMESTAMP_RE.test(line)) continue;
    if (/₪|NIS|ש"?ח|שח|\d/.test(line)) continue;
    const wordCount = line.split(/\s+/).length;
    if (wordCount >= 1 && wordCount <= 5 && line.length <= 60) return line;
  }
  return null;
}

export function parseWuiRawPost(
  raw: RawPost,
  now: Date = new Date(),
): ExtensionScrapedPost | null {
  const text = raw.text.trim();
  if (text.length < 40) return null;
  const groupUrl = raw.groupUrl;
  if (!groupUrl) return null;

  const hash = djb2(text.slice(0, 240));
  const postId = `wui-${hash}`;
  const permalinkBase = groupUrl.endsWith("/") ? groupUrl : `${groupUrl}/`;
  const permalink = `${permalinkBase}#${postId}`;

  return {
    postId,
    permalink,
    groupUrl,
    groupName: raw.groupName ?? null,
    text,
    authorName: raw.authorName ?? null,
    authorUrl: raw.authorUrl ?? null,
    timestampIso: null,
    scrapedAt: now.toISOString(),
  };
}

function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 33) ^ s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}
