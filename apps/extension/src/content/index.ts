import type { ExtensionScrapedPost } from "@apartment-finder/shared";
import type { ScrapedPostsMessage } from "../lib/messages";
import {
  extractPostsFromDocument,
  extractWuiPostsFromDocument,
  parseRawPost,
  parseWuiRawPost,
  type RawPost,
} from "./scraper";

const SCAN_DEBOUNCE_MS = 1500;
const BATCH_SIZE = 25;
const seenInSession = new Set<string>();
const pending = new Map<string, ExtensionScrapedPost>();
let scanTimer: number | null = null;
let flushTimer: number | null = null;

function scheduleScan(): void {
  if (scanTimer !== null) return;
  scanTimer = window.setTimeout(() => {
    scanTimer = null;
    runScan();
  }, SCAN_DEBOUNCE_MS);
}

let scanCount = 0;

function runScan(): void {
  scanCount++;
  let strategy: "desktop" | "wui" = "desktop";
  let raws: RawPost[] = extractPostsFromDocument(document);
  let parse: (r: RawPost) => ExtensionScrapedPost | null = parseRawPost;
  if (raws.length === 0) {
    strategy = "wui";
    raws = extractWuiPostsFromDocument(document);
    parse = parseWuiRawPost;
  }

  let added = 0;
  let rejected = 0;
  const sample: Array<{ reason: string; permalink: string | null; len: number }> = [];
  for (const raw of raws) {
    const post = parse(raw);
    if (!post) {
      rejected++;
      if (sample.length < 3) {
        sample.push({
          reason: rejectReason(raw),
          permalink: raw.permalink,
          len: raw.text.length,
        });
      }
      continue;
    }
    if (seenInSession.has(post.postId)) continue;
    seenInSession.add(post.postId);
    pending.set(post.postId, post);
    added++;
  }
  console.info(
    `[apartment-finder] scan#${scanCount} strategy=${strategy} containers=${raws.length} added=${added} rejected=${rejected} pending=${pending.size}`,
    rejected > 0 ? sample : "",
  );
  if (pending.size > 0) scheduleFlush();
}

function rejectReason(raw: { text: string; permalink: string | null }): string {
  if (raw.text.trim().length < 20) return "text<20";
  if (!raw.permalink) return "no-permalink";
  return "permalink-shape";
}

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flush();
  }, 2000);
}

async function flush(): Promise<void> {
  if (pending.size === 0) return;
  const batch = [...pending.values()].slice(0, BATCH_SIZE);
  for (const p of batch) pending.delete(p.postId);

  const msg: ScrapedPostsMessage = { kind: "scraped-posts", posts: batch };
  try {
    await chrome.runtime.sendMessage(msg);
  } catch (err) {
    console.warn("[apartment-finder] sendMessage failed", err);
  }

  if (pending.size > 0) scheduleFlush();
}

const observer = new MutationObserver(() => scheduleScan());
observer.observe(document.body, { childList: true, subtree: true });

scheduleScan();
console.info("[apartment-finder] content script active");
