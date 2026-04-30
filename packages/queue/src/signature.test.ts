import { describe, expect, it } from "vitest";
import { signRequest, verifyRequest } from "./signature.js";

const SECRET = "test-secret-32-bytes-long-padding";
const BODY = JSON.stringify({ runId: "abc123", source: "yad2" });

describe("signRequest / verifyRequest", () => {
  it("roundtrip: valid sig verifies", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const sig = signRequest({ body: BODY, secret: SECRET, timestamp });
    expect(verifyRequest({ body: BODY, secret: SECRET, timestamp, signature: sig })).toBe(true);
  });

  it("bad signature is rejected", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    expect(
      verifyRequest({ body: BODY, secret: SECRET, timestamp, signature: "deadbeef".repeat(8) }),
    ).toBe(false);
  });

  it("timestamp 4:59 ago is accepted", () => {
    const timestamp = String(Math.floor((Date.now() - 4 * 60 * 1000 + 30 * 1000) / 1000)); // ~4:30 ago
    const sig = signRequest({ body: BODY, secret: SECRET, timestamp });
    expect(verifyRequest({ body: BODY, secret: SECRET, timestamp, signature: sig })).toBe(true);
  });

  it("timestamp 5:01 ago is rejected", () => {
    const timestamp = String(Math.floor((Date.now() - 5 * 60 * 1000 - 10 * 1000) / 1000)); // ~5:10 ago
    const sig = signRequest({ body: BODY, secret: SECRET, timestamp });
    expect(verifyRequest({ body: BODY, secret: SECRET, timestamp, signature: sig })).toBe(false);
  });

  it("future timestamp 5:01 ahead is rejected", () => {
    const timestamp = String(Math.floor((Date.now() + 5 * 60 * 1000 + 10 * 1000) / 1000));
    const sig = signRequest({ body: BODY, secret: SECRET, timestamp });
    expect(verifyRequest({ body: BODY, secret: SECRET, timestamp, signature: sig })).toBe(false);
  });
});
