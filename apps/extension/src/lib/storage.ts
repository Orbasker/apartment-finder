export type ExtensionSettings = {
  ingestUrl: string;
  secret: string;
};

const DEFAULTS: ExtensionSettings = {
  ingestUrl: "http://localhost:3000/api/webhooks/extension",
  secret: ""
};

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = (await chrome.storage.local.get(DEFAULTS)) as ExtensionSettings;
  return { ...DEFAULTS, ...stored };
}

export async function saveSettings(next: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set(next);
}

const SEEN_KEY = "seenPostIds";
const SEEN_MAX = 2000;

export async function filterUnseen(ids: string[]): Promise<string[]> {
  const { [SEEN_KEY]: seenList = [] } = (await chrome.storage.local.get(
    SEEN_KEY
  )) as { [SEEN_KEY]?: string[] };
  const seen = new Set(seenList);
  return ids.filter((id) => !seen.has(id));
}

export async function markSeen(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { [SEEN_KEY]: seenList = [] } = (await chrome.storage.local.get(
    SEEN_KEY
  )) as { [SEEN_KEY]?: string[] };
  const merged = [...seenList, ...ids];
  const trimmed = merged.slice(-SEEN_MAX);
  await chrome.storage.local.set({ [SEEN_KEY]: trimmed });
}
