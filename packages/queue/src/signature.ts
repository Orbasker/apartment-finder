// Lazy ioredis singleton. TLS-aware. BullMQ requires maxRetriesPerRequest:null.
import { createHmac, timingSafeEqual } from "node:crypto";

interface SignOptions {
  body: string;
  secret: string;
  timestamp: string; // unix seconds as string, e.g. String(Math.floor(Date.now()/1000))
}

interface VerifyOptions extends SignOptions {
  signature: string; // hex string from X-Signature header
  maxSkewMs?: number; // default 5 * 60 * 1000
}

export function signRequest({ body, secret, timestamp }: SignOptions): string {
  return createHmac("sha256", secret).update(`${timestamp}\n${body}`).digest("hex");
}

export function verifyRequest({
  body,
  secret,
  timestamp,
  signature,
  maxSkewMs = 5 * 60 * 1000,
}: VerifyOptions): boolean {
  // Reject if timestamp is too old or too far in the future
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const skewMs = Math.abs(Date.now() - ts * 1000);
  if (skewMs > maxSkewMs) return false;

  // Timing-safe compare
  const expected = signRequest({ body, secret, timestamp });
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch {
    // Buffer lengths differ → bad hex → not equal
    return false;
  }
}
