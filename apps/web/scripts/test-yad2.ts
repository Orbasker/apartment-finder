#!/usr/bin/env bun
/**
 * Manual end-to-end smoke test for the Yad2 scraper.
 *
 *   bun run apps/web/scripts/test-yad2.ts         # fetch + normalize only
 *   bun run apps/web/scripts/test-yad2.ts --ingest # also insert into DB (requires .env)
 *
 * Prints counts, a few sample listings, and verifies each row passes the
 * NormalizedListingSchema.
 */
import { NormalizedListingSchema } from "@apartment-finder/shared";
import { fetchYad2Listings } from "../src/scrapers/yad2";

const shouldIngest = process.argv.includes("--ingest");

async function main() {
  const t0 = Date.now();
  const listings = await fetchYad2Listings();
  const fetchMs = Date.now() - t0;

  console.log(`fetched ${listings.length} listings in ${fetchMs}ms`);

  const validation = listings.map((l) => NormalizedListingSchema.safeParse(l));
  const invalid = validation.filter((v) => !v.success);
  console.log(`schema-valid: ${listings.length - invalid.length}/${listings.length}`);
  if (invalid.length > 0) {
    const first = invalid[0];
    if (first && !first.success) console.error("first schema error:", first.error.issues);
    process.exit(1);
  }

  console.log("\nsample (first 3):");
  for (const l of listings.slice(0, 3)) {
    console.log({
      source: l.source,
      sourceId: l.sourceId,
      url: l.url,
      priceNis: l.priceNis,
      rooms: l.rooms,
      sqm: l.sqm,
      neighborhood: l.neighborhood,
      street: l.street,
      isAgency: l.isAgency,
    });
  }

  if (shouldIngest) {
    console.log("\n(--ingest is disabled while the ingestion pipeline is being rebuilt)");
  }
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
