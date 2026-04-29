import { describe, expect, test } from "vitest";
import { activeChannels, type DestinationsRow } from "./destinations";

function row(patch: Partial<DestinationsRow> = {}): DestinationsRow {
  return {
    userId: "00000000-0000-0000-0000-000000000000",
    emailEnabled: true,
    telegramEnabled: false,
    telegramChatId: null,
    telegramLinkedAt: null,
    updatedAt: new Date(),
    ...patch,
  };
}

describe("activeChannels", () => {
  test("default row → email only", () => {
    expect(activeChannels(row())).toEqual(["email"]);
  });

  test("telegram on + linked → both", () => {
    expect(activeChannels(row({ telegramEnabled: true, telegramChatId: "12345" }))).toEqual([
      "email",
      "telegram",
    ]);
  });

  test("telegram on but unlinked is dropped (avoids sending into the void)", () => {
    expect(activeChannels(row({ telegramEnabled: true, telegramChatId: null }))).toEqual(["email"]);
  });

  test("email off + telegram on + linked → telegram only", () => {
    expect(
      activeChannels(row({ emailEnabled: false, telegramEnabled: true, telegramChatId: "9" })),
    ).toEqual(["telegram"]);
  });

  test("both off → empty (caller must short-circuit)", () => {
    expect(activeChannels(row({ emailEnabled: false }))).toEqual([]);
  });
});
