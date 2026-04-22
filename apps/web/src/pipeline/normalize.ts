import { createHash } from "node:crypto";
import type { NormalizedListing } from "@apartment-finder/shared";

export function listingTextHash(listing: NormalizedListing): string {
  const parts = [
    listing.description ?? "",
    listing.title ?? "",
    String(listing.priceNis ?? ""),
    listing.neighborhood ?? "",
    listing.street ?? "",
  ].join("|");
  return createHash("sha256").update(parts).digest("hex");
}
