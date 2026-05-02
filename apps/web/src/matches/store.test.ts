import { describe, expect, test } from "vitest";

import {
  getMatchBoard,
  getMatchFeed,
  getUnreadAlerts,
  loadMedianContext,
  markAlertsSeen,
  setApartmentStatus,
  USER_APARTMENT_STATUS_KINDS,
} from "./store";

// PR1 lands the loaders without UI wiring; PR2/3/4 will exercise them against
// a real DB. Until then, this file is a smoke test that pins the public API
// surface so a future refactor can't silently break the page-level callers.

describe("matches/store: public exports", () => {
  test("loader functions are exported", () => {
    expect(typeof getMatchFeed).toBe("function");
    expect(typeof getMatchBoard).toBe("function");
    expect(typeof getUnreadAlerts).toBe("function");
    expect(typeof loadMedianContext).toBe("function");
  });

  test("mutators are exported", () => {
    expect(typeof markAlertsSeen).toBe("function");
    expect(typeof setApartmentStatus).toBe("function");
  });

  test("status kind list matches the kanban column set in PR4", () => {
    expect(USER_APARTMENT_STATUS_KINDS).toEqual([
      "new",
      "interested",
      "contacted",
      "visited",
      "rejected",
    ]);
  });

  test("markAlertsSeen short-circuits on an empty apartment list without hitting the DB", async () => {
    // Passes user id that's never authenticated against any DB; the early
    // return for empty arrays must keep this from issuing a query.
    await expect(markAlertsSeen("00000000-0000-0000-0000-000000000000", [])).resolves.toBe(0);
  });
});
