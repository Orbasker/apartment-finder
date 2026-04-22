import {
  EXTENSION_INGEST_HEADER,
  ExtensionIngestPayloadSchema,
  type ExtensionIngestPayload,
} from "@apartment-finder/shared";
import type { Message, ScrapedPostsMessage } from "./lib/messages";
import { filterUnseen, getSettings, markSeen } from "./lib/storage";

chrome.runtime.onMessage.addListener(
  (
    msg: Message | unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (r: unknown) => void,
  ) => {
    if (!isScrapedPosts(msg)) return false;
    void handleScrapedPosts(msg).then(sendResponse);
    return true;
  },
);

function isScrapedPosts(m: unknown): m is ScrapedPostsMessage {
  return (
    typeof m === "object" &&
    m !== null &&
    (m as { kind?: unknown }).kind === "scraped-posts"
  );
}

async function handleScrapedPosts(
  msg: ScrapedPostsMessage,
): Promise<{ ok: boolean; error?: string; status?: number; inserted?: number }> {
  const settings = await getSettings();
  if (!settings.secret || !settings.ingestUrl) {
    console.warn("[apartment-finder] extension settings incomplete");
    return { ok: false, error: "settings missing" };
  }

  const ids = msg.posts.map((p) => p.postId);
  const unseen = new Set(await filterUnseen(ids));
  const posts = msg.posts.filter((p) => unseen.has(p.postId));
  if (posts.length === 0) return { ok: true, inserted: 0 };

  const payload: ExtensionIngestPayload = ExtensionIngestPayloadSchema.parse({
    posts,
  });

  try {
    const res = await fetch(settings.ingestUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [EXTENSION_INGEST_HEADER]: settings.secret,
      },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => ({}))) as {
      inserted?: number;
      error?: string;
    };
    if (!res.ok) {
      console.warn("[apartment-finder] ingest failed", res.status, body);
      return { ok: false, status: res.status, error: body.error };
    }
    await markSeen(posts.map((p) => p.postId));
    console.info("[apartment-finder] ingested", {
      sent: posts.length,
      inserted: body.inserted,
    });
    return { ok: true, status: res.status, inserted: body.inserted };
  } catch (err) {
    console.warn("[apartment-finder] ingest error", err);
    return { ok: false, error: String(err) };
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.runtime.openOptionsPage().catch(() => undefined);
});
