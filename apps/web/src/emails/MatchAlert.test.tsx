import { describe, expect, test } from "vitest";
import { render } from "@react-email/render";
import { MatchAlertEmail, type MatchAlertProps } from "./MatchAlert";

const baseProps: MatchAlertProps = {
  apartmentId: 42,
  neighborhood: "פלורנטין",
  formattedAddress: "Herzl 12, Tel Aviv-Yafo, Israel",
  rooms: 2.5,
  sqm: 60,
  floor: 3,
  priceNis: 7500,
  sourceUrl: "https://example.com/listing/42",
  filtersUrl: "https://example.com/filters",
  matchedAttributes: ["elevator", "parking"],
};

describe("MatchAlertEmail", () => {
  test("renders Hebrew subject-style heading and CTA", async () => {
    const html = await render(MatchAlertEmail(baseProps));
    expect(html).toContain("דירה חדשה תואמת לסינונים שלך");
    expect(html).toContain("פתח את המודעה");
    expect(html).toContain("https://example.com/listing/42");
  });

  test("declares dir=rtl and lang=he", async () => {
    const html = await render(MatchAlertEmail(baseProps));
    expect(html).toContain('dir="rtl"');
    expect(html).toMatch(/lang="he"/);
  });

  test("wraps numerics in <bdi>", async () => {
    const html = await render(MatchAlertEmail(baseProps));
    expect(html).toMatch(/<bdi>₪7,500<\/bdi>/);
    expect(html).toMatch(/<bdi>2\.5 חדרים<\/bdi>/);
  });

  test("matched attribute labels appear in Hebrew", async () => {
    const html = await render(MatchAlertEmail(baseProps));
    expect(html).toContain("מעלית");
    expect(html).toContain("חניה");
  });

  test("plain-text fallback is non-empty and contains the address", async () => {
    const text = await render(MatchAlertEmail(baseProps), { plainText: true });
    expect(text.length).toBeGreaterThan(20);
    expect(text).toContain("Herzl 12");
  });

  test("renders gracefully with everything null", async () => {
    const html = await render(
      MatchAlertEmail({
        apartmentId: 1,
        neighborhood: null,
        formattedAddress: null,
        rooms: null,
        sqm: null,
        floor: null,
        priceNis: null,
        sourceUrl: null,
        filtersUrl: null,
        matchedAttributes: [],
      }),
    );
    expect(html).toContain("דירה חדשה תואמת לסינונים שלך");
  });
});
