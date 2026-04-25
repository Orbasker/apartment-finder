import { describe, expect, test } from "vitest";
import {
  extractPostIdFromUrl,
  normalizePermalink,
  parseRawPost,
  parseWuiRawPost,
  type RawPost,
} from "./scraper";

const baseRaw: RawPost = {
  text: "",
  permalink: null,
  authorName: null,
  authorUrl: null,
  timestampIso: null,
  groupUrl: null,
  groupName: null,
};

describe("extractPostIdFromUrl", () => {
  test("pulls id from /groups/<g>/posts/<id>", () => {
    expect(
      extractPostIdFromUrl("https://www.facebook.com/groups/telavivrentals/posts/1234567890"),
    ).toBe("1234567890");
  });
  test("pulls id from /groups/<g>/permalink/<id>", () => {
    expect(
      extractPostIdFromUrl("https://www.facebook.com/groups/telavivrentals/permalink/987654321/"),
    ).toBe("987654321");
  });
  test("pulls id from permalink.php?story_fbid=", () => {
    expect(
      extractPostIdFromUrl("https://www.facebook.com/permalink.php?story_fbid=55555&id=100"),
    ).toBe("55555");
  });
  test("returns null for non-post URL", () => {
    expect(extractPostIdFromUrl("https://www.facebook.com/")).toBe(null);
  });
});

describe("normalizePermalink", () => {
  test("strips tracking params but keeps story_fbid", () => {
    const out = normalizePermalink(
      "https://www.facebook.com/permalink.php?story_fbid=1&id=2&__cft__=abc",
    );
    expect(out).toBe("https://www.facebook.com/permalink.php?story_fbid=1&id=2");
  });
  test("drops hash fragment", () => {
    const out = normalizePermalink("https://www.facebook.com/groups/g/posts/1#comments");
    expect(out).toBe("https://www.facebook.com/groups/g/posts/1");
  });
});

describe("parseRawPost", () => {
  const permalink = "https://www.facebook.com/groups/g/posts/42424242";

  test("returns null when text is too short", () => {
    expect(parseRawPost({ ...baseRaw, text: "short", permalink })).toBe(null);
  });

  test("returns null when permalink is missing", () => {
    expect(
      parseRawPost({
        ...baseRaw,
        text: "a post with enough characters to pass the length gate",
        permalink: null,
      }),
    ).toBe(null);
  });

  test("returns null when permalink is not a post URL", () => {
    expect(
      parseRawPost({
        ...baseRaw,
        text: "a post with enough characters to pass the length gate",
        permalink: "https://www.facebook.com/groups/g/about",
      }),
    ).toBe(null);
  });

  test("returns a normalized post when inputs are valid", () => {
    const now = new Date("2026-04-22T10:00:00.000Z");
    const out = parseRawPost(
      {
        ...baseRaw,
        text: "  3-bedroom in Florentin, 7500 NIS — DM me  ",
        permalink: `${permalink}?__cft__=abc#comments`,
        authorName: "Jane Doe",
        authorUrl: "https://www.facebook.com/jane",
        timestampIso: "2026-04-22T09:58:00.000Z",
        groupUrl: "https://www.facebook.com/groups/g/",
        groupName: "TA Rentals",
      },
      now,
    );
    expect(out).toEqual({
      postId: "42424242",
      permalink,
      groupUrl: "https://www.facebook.com/groups/g/",
      groupName: "TA Rentals",
      text: "3-bedroom in Florentin, 7500 NIS — DM me",
      authorName: "Jane Doe",
      authorUrl: "https://www.facebook.com/jane",
      timestampIso: "2026-04-22T09:58:00.000Z",
      scrapedAt: now.toISOString(),
    });
  });

  test("returns null when timestampIso is garbage", () => {
    expect(
      parseRawPost({
        ...baseRaw,
        text: "long enough text for a real post body",
        permalink,
        timestampIso: "not-a-date",
      }),
    ).toBe(null);
  });
});

describe("parseWuiRawPost", () => {
  const groupUrl = "https://www.facebook.com/groups/2065942027026008/";
  const postText =
    "סאבלט בלב תל אביב - רחוב מרכז בעלי מלאכה. דקה משנקין, שוק הכרמל, נחלת בנימין וכל מה שטוב. 7/5-21/5 המחיר 1900 שח";

  test("returns null for short text", () => {
    expect(parseWuiRawPost({ ...baseRaw, text: "short", groupUrl })).toBe(null);
  });

  test("returns null without a groupUrl", () => {
    expect(parseWuiRawPost({ ...baseRaw, text: postText, groupUrl: null })).toBe(null);
  });

  test("synthesizes a wui-prefixed postId and permalink fragment", () => {
    const now = new Date("2026-04-22T10:00:00.000Z");
    const a = parseWuiRawPost({ ...baseRaw, text: postText, groupUrl }, now);
    expect(a).not.toBe(null);
    expect(a!.postId.startsWith("wui-")).toBe(true);
    expect(a!.permalink).toBe(`${groupUrl}#${a!.postId}`);
    expect(a!.timestampIso).toBe(null);
  });

  test("is stable across truncation: same prefix → same id", () => {
    const longBody = postText.padEnd(260, " extra");
    const truncated = longBody.slice(0, 80) + "…";
    const a = parseWuiRawPost({ ...baseRaw, text: longBody, groupUrl });
    const b = parseWuiRawPost(
      { ...baseRaw, text: longBody + "\n\nmore appended content", groupUrl },
      new Date(),
    );
    const c = parseWuiRawPost({ ...baseRaw, text: truncated, groupUrl });
    expect(a!.postId).toBe(b!.postId);
    expect(a!.postId).not.toBe(c!.postId);
  });

  test("distinct text yields distinct ids", () => {
    const a = parseWuiRawPost({ ...baseRaw, text: postText, groupUrl });
    const b = parseWuiRawPost({
      ...baseRaw,
      text: postText.replace("מרכז", "אחר"),
      groupUrl,
    });
    expect(a!.postId).not.toBe(b!.postId);
  });
});
