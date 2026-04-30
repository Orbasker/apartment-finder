import { describe, expect, test } from "vitest";
import { buildMessageHtml, type TelegramAlertProps } from "./telegram.js";

const baseProps: TelegramAlertProps = {
  chatId: "123",
  neighborhood: "פלורנטין",
  formattedAddress: "אבולעפיה 12, תל אביב",
  rooms: 3,
  sqm: 60,
  floor: 2,
  priceNis: 7500,
  sourceUrl: "https://example.com/x",
  matchedAttributes: [],
  unverifiedAttributes: [],
  pricePerSqm: 125,
  arnonaNis: 350,
  vaadBayitNis: null,
  condition: null,
  entryDate: null,
  balconySqm: null,
  totalFloors: null,
  furnitureStatus: null,
};

describe("buildMessageHtml", () => {
  test("opens with bold Hebrew header", () => {
    const html = buildMessageHtml({ ...baseProps });
    expect(html.startsWith("<b>דירה חדשה תואמת לסינונים שלך</b>")).toBe(true);
  });

  test("includes the formatted address line when present", () => {
    const html = buildMessageHtml({ ...baseProps });
    expect(html).toContain("אבולעפיה 12, תל אביב");
  });

  test("renders price/rooms/sqm/floor/neighborhood meta separated by middle-dots", () => {
    const html = buildMessageHtml({ ...baseProps });
    expect(html).toContain("₪7,500");
    expect(html).toContain("3 חדרים");
    expect(html).toContain('60 מ"ר');
    expect(html).toContain("קומה 2");
    expect(html).toContain("פלורנטין");
    expect(html).toContain(" · ");
  });

  test('renders "מידע נוסף" section when there is at least one row', () => {
    const html = buildMessageHtml({ ...baseProps });
    expect(html).toContain("<b>מידע נוסף על הנכס</b>");
    expect(html).toContain('מחיר למ"ר');
    expect(html).toContain("ארנונה");
  });

  test("omits the additional-info section when no rows are populated", () => {
    const html = buildMessageHtml({
      ...baseProps,
      pricePerSqm: null,
      arnonaNis: null,
      vaadBayitNis: null,
      condition: null,
      entryDate: null,
      balconySqm: null,
      totalFloors: null,
      furnitureStatus: null,
    });
    expect(html).not.toContain("מידע נוסף על הנכס");
  });

  test("escapes HTML control chars in user-controlled fields", () => {
    const html = buildMessageHtml({
      ...baseProps,
      neighborhood: "<script>alert(1)</script>",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  test("includes the matched-attributes summary when there are matches", () => {
    const html = buildMessageHtml({ ...baseProps, matchedAttributes: ["elevator", "balcony"] });
    expect(html).toContain("תואם לסינונים שלך:");
    expect(html).toContain("מעלית");
    expect(html).toContain("מרפסת");
  });

  test("hides the matched-attributes section when none matched", () => {
    const html = buildMessageHtml({ ...baseProps, matchedAttributes: [] });
    expect(html).not.toContain("תואם לסינונים שלך:");
  });

  test("includes the unverified-must-haves section with Hebrew labels", () => {
    const html = buildMessageHtml({
      ...baseProps,
      unverifiedAttributes: ["elevator", "parking"],
    });
    expect(html).toContain("לא הצלחנו לאמת מהמודעה");
    expect(html).toContain("מעלית");
    expect(html).toContain("חניה");
  });

  test("hides the unverified-must-haves section when empty", () => {
    const html = buildMessageHtml({ ...baseProps, unverifiedAttributes: [] });
    expect(html).not.toContain("לא הצלחנו לאמת מהמודעה");
  });
});
