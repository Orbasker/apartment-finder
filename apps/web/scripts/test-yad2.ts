#!/usr/bin/env bun
/**
 * Manual end-to-end smoke test for the Yad2 scraper.
 *
 *   bun run apps/web/scripts/test-yad2.ts
 *
 * Prints counts and a few sample listings.
 */
import { fetchYad2Listings } from "../src/scrapers/yad2";

const shouldIngest = process.argv.includes("--ingest");

async function main() {
  const t0 = Date.now();
  const listings = await fetchYad2Listings();
  const fetchMs = Date.now() - t0;

  console.log(`fetched ${listings.length} listings in ${fetchMs}ms`);

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
