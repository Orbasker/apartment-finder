import { and, asc, eq, ilike, or } from "drizzle-orm";
import type { CitySelection } from "@apartment-finder/shared";
import { getDb } from "@/db";
import { cities } from "@/db/schema";

export type CityCandidate = CitySelection & {
  slug: string;
  isLaunchReady: boolean;
};

export async function searchActiveCities(query: string): Promise<CityCandidate[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const rows = await getDb()
    .select({
      cityId: cities.id,
      placeId: cities.placeId,
      nameHe: cities.nameHe,
      nameEn: cities.nameEn,
      slug: cities.slug,
      isLaunchReady: cities.isLaunchReady,
    })
    .from(cities)
    .where(
      and(
        eq(cities.isActive, true),
        or(
          ilike(cities.nameHe, `%${trimmed}%`),
          ilike(cities.nameEn, `%${trimmed}%`),
          ilike(cities.slug, `%${trimmed}%`),
        ),
      ),
    )
    .orderBy(asc(cities.isLaunchReady), asc(cities.nameHe))
    .limit(8);
  return rows.sort((a, b) => Number(b.isLaunchReady) - Number(a.isLaunchReady));
}

export async function listLaunchReadyCities(): Promise<CityCandidate[]> {
  return getDb()
    .select({
      cityId: cities.id,
      placeId: cities.placeId,
      nameHe: cities.nameHe,
      nameEn: cities.nameEn,
      slug: cities.slug,
      isLaunchReady: cities.isLaunchReady,
    })
    .from(cities)
    .where(and(eq(cities.isActive, true), eq(cities.isLaunchReady, true)))
    .orderBy(asc(cities.nameHe));
}
