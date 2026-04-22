import type { NormalizedListing, Preferences } from "@apartment-finder/shared";

export type RuleFilterResult =
  | { pass: true }
  | { pass: false; reason: string };

export function ruleFilter(
  listing: NormalizedListing,
  prefs: Preferences,
): RuleFilterResult {
  if (listing.priceNis != null) {
    const cap = Math.round(
      prefs.budget.maxNis * (1 + prefs.budget.flexibilityPct / 100),
    );
    if (listing.priceNis > cap) {
      return { pass: false, reason: `price ${listing.priceNis} > ${cap}` };
    }
    if (prefs.budget.minNis > 0 && listing.priceNis < prefs.budget.minNis) {
      return {
        pass: false,
        reason: `price ${listing.priceNis} < min ${prefs.budget.minNis} (likely spam)`,
      };
    }
  }

  if (listing.rooms != null) {
    if (listing.rooms < prefs.rooms.min) {
      return { pass: false, reason: `rooms ${listing.rooms} < min ${prefs.rooms.min}` };
    }
    if (listing.rooms > prefs.rooms.max) {
      return { pass: false, reason: `rooms ${listing.rooms} > max ${prefs.rooms.max}` };
    }
  }

  if (listing.sqm != null) {
    if (prefs.sizeSqm?.min != null && listing.sqm < prefs.sizeSqm.min) {
      return { pass: false, reason: `sqm ${listing.sqm} < min ${prefs.sizeSqm.min}` };
    }
    if (prefs.sizeSqm?.max != null && listing.sqm > prefs.sizeSqm.max) {
      return { pass: false, reason: `sqm ${listing.sqm} > max ${prefs.sizeSqm.max}` };
    }
  }

  if (listing.neighborhood) {
    const nb = listing.neighborhood.toLowerCase();
    if (prefs.blockedNeighborhoods.some((b) => nb.includes(b.toLowerCase()))) {
      return { pass: false, reason: `blocked neighborhood: ${listing.neighborhood}` };
    }
    if (
      prefs.allowedNeighborhoods.length > 0 &&
      !prefs.allowedNeighborhoods.some((a) => nb.includes(a.toLowerCase()))
    ) {
      return { pass: false, reason: `not in allowed neighborhoods: ${listing.neighborhood}` };
    }
  }

  if (listing.postedAt) {
    const ageHours = (Date.now() - listing.postedAt.getTime()) / 3_600_000;
    if (ageHours > prefs.maxAgeHours) {
      return { pass: false, reason: `too old: ${ageHours.toFixed(1)}h` };
    }
  }

  return { pass: true };
}
