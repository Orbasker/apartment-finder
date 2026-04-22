import { EXTENSION_INGEST_HEADER } from "@apartment-finder/shared";
import { getSettings, saveSettings } from "../lib/storage";

const ingestUrlEl = document.querySelector<HTMLInputElement>("#ingestUrl")!;
const secretEl = document.querySelector<HTMLInputElement>("#secret")!;
const saveEl = document.querySelector<HTMLButtonElement>("#save")!;
const pingEl = document.querySelector<HTMLButtonElement>("#ping")!;
const statusEl = document.querySelector<HTMLDivElement>("#status")!;

async function load(): Promise<void> {
  const s = await getSettings();
  ingestUrlEl.value = s.ingestUrl;
  secretEl.value = s.secret;
}

function setStatus(text: string, ok: boolean): void {
  statusEl.textContent = text;
  statusEl.className = `status ${ok ? "ok" : "err"}`;
}

saveEl.addEventListener("click", async () => {
  await saveSettings({
    ingestUrl: ingestUrlEl.value.trim(),
    secret: secretEl.value.trim(),
  });
  setStatus("Saved.", true);
});

pingEl.addEventListener("click", async () => {
  const url = ingestUrlEl.value.trim();
  const secret = secretEl.value.trim();
  if (!url || !secret) {
    setStatus("Fill both fields first.", false);
    return;
  }
  setStatus("Sending test payload…", true);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [EXTENSION_INGEST_HEADER]: secret,
      },
      body: JSON.stringify({
        posts: [
          {
            postId: `ping-${Date.now()}`,
            permalink: `https://www.facebook.com/groups/test/posts/${Date.now()}`,
            text: "Extension test ping — safe to ignore.",
            scrapedAt: new Date().toISOString(),
          },
        ],
      }),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) {
      setStatus(`OK (${res.status}): ${JSON.stringify(body)}`, true);
    } else {
      setStatus(`HTTP ${res.status}: ${JSON.stringify(body)}`, false);
    }
  } catch (err) {
    setStatus(`Error: ${String(err)}`, false);
  }
});

void load();
