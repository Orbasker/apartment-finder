import { createHash } from "node:crypto";

export function contentHash(input: string | Record<string, unknown> | unknown): string {
  const str = typeof input === "string" ? input : JSON.stringify(input);
  return createHash("sha256").update(str).digest("hex");
}
