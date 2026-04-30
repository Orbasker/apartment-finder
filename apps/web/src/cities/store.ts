import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
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
  // ORDER BY launch-ready DESC FIRST so the LIMIT 8 keeps launch-ready hits when
  // the catalog grows past 8 matches; client-side resort can't recover dropped rows.
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
    .orderBy(desc(cities.isLaunchReady), asc(cities.nameHe))
    .limit(8);
  return rows;
}

export async function getCityById(cityId: string): Promise<CityCandidate | null> {
  const [row] = await getDb()
    .select({
      cityId: cities.id,
      placeId: cities.placeId,
      nameHe: cities.nameHe,
      nameEn: cities.nameEn,
      slug: cities.slug,
      isLaunchReady: cities.isLaunchReady,
    })
    .from(cities)
    .where(and(eq(cities.id, cityId), eq(cities.isActive, true)))
    .limit(1);
  return row ?? null;
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
