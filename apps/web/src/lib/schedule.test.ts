import { describe, expect, test } from "bun:test";
import {
  describeLocalSchedule,
  getScheduleTimeZone,
  shouldRunApifyPoll,
  shouldRunYad2Poll,
} from "./schedule";

describe("shouldRunYad2Poll", () => {
  test("allows local midnight", () => {
    expect(shouldRunYad2Poll(new Date("2026-04-21T21:00:00.000Z"))).toBe(true);
  });

  test("blocks local night hours before 08:00", () => {
    expect(shouldRunYad2Poll(new Date("2026-04-21T22:00:00.000Z"))).toBe(false);
    expect(shouldRunYad2Poll(new Date("2026-04-22T04:30:00.000Z"))).toBe(false);
  });

  test("allows local 08:00 onwards", () => {
    expect(shouldRunYad2Poll(new Date("2026-04-22T05:00:00.000Z"))).toBe(true);
    expect(shouldRunYad2Poll(new Date("2026-04-22T18:30:00.000Z"))).toBe(true);
  });
});

describe("shouldRunApifyPoll", () => {
  test("allows the configured local slots", () => {
    expect(shouldRunApifyPoll(new Date("2026-04-22T05:00:00.000Z"))).toBe(true);
    expect(shouldRunApifyPoll(new Date("2026-04-22T08:00:00.000Z"))).toBe(true);
    expect(shouldRunApifyPoll(new Date("2026-04-22T17:00:00.000Z"))).toBe(true);
  });

  test("blocks other local daytime hours", () => {
    expect(shouldRunApifyPoll(new Date("2026-04-22T06:00:00.000Z"))).toBe(false);
    expect(shouldRunApifyPoll(new Date("2026-04-22T10:00:00.000Z"))).toBe(false);
  });
});

describe("describeLocalSchedule", () => {
  test("reports the app timezone", () => {
    expect(getScheduleTimeZone()).toBe("Asia/Jerusalem");
    expect(describeLocalSchedule(new Date("2026-04-22T05:00:00.000Z"))).toBe(
      "08:00 Asia/Jerusalem",
    );
  });
});
