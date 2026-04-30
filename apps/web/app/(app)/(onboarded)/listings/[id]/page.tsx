import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { apartments, listingExtractions, listings } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FURNITURE_STATUS_LABELS, FurnitureStatusSchema } from "@apartment-finder/shared";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "דירה - Apartment Finder",
};

type PageProps = { params: Promise<{ id: string }> };

export default async function ListingPage({ params }: PageProps) {
  const { id } = await params;
  const apartmentId = Number(id);
  if (!Number.isInteger(apartmentId) || apartmentId <= 0) notFound();

  const db = getDb();
  const [row] = await db
    .select({
      id: apartments.id,
      neighborhood: apartments.neighborhood,
      formattedAddress: apartments.formattedAddress,
      rooms: apartments.rooms,
      sqm: apartments.sqm,
      floor: apartments.floor,
      priceNisLatest: apartments.priceNisLatest,
      sourceUrl: listings.url,
      condition: listingExtractions.condition,
      arnonaNis: listingExtractions.arnonaNis,
      vaadBayitNis: listingExtractions.vaadBayitNis,
      entryDate: listingExtractions.entryDate,
      balconySqm: listingExtractions.balconySqm,
      totalFloors: listingExtractions.totalFloors,
      furnitureStatus: listingExtractions.furnitureStatus,
    })
    .from(apartments)
    .leftJoin(listings, eq(listings.id, apartments.primaryListingId))
    .leftJoin(listingExtractions, eq(listingExtractions.listingId, apartments.primaryListingId))
    .where(eq(apartments.id, apartmentId))
    .limit(1);

  if (!row) notFound();

  const pricePerSqm =
    row.priceNisLatest != null && row.sqm != null && row.sqm > 0
      ? Math.round(row.priceNisLatest / row.sqm)
      : null;
  const furnitureParsed = FurnitureStatusSchema.safeParse(row.furnitureStatus);
  const furnitureStatus = furnitureParsed.success ? furnitureParsed.data : null;

  const meta: string[] = [];
  if (row.priceNisLatest != null) meta.push(`₪${row.priceNisLatest.toLocaleString("he-IL")}`);
  if (row.rooms != null) meta.push(`${row.rooms} חדרים`);
  if (row.sqm != null) meta.push(`${row.sqm} מ"ר`);
  if (row.floor != null) meta.push(`קומה ${row.floor}`);
  if (row.neighborhood) meta.push(row.neighborhood);

  const info: { label: string; value: string }[] = [];
  if (pricePerSqm != null)
    info.push({ label: 'מחיר למ"ר', value: `₪${pricePerSqm.toLocaleString("he-IL")}` });
  if (row.arnonaNis != null)
    info.push({ label: "ארנונה", value: `₪${row.arnonaNis.toLocaleString("he-IL")}` });
  if (row.vaadBayitNis != null)
    info.push({ label: "ועד בית", value: `₪${row.vaadBayitNis.toLocaleString("he-IL")}` });
  if (row.condition) info.push({ label: "מצב הנכס", value: row.condition });
  if (row.entryDate) info.push({ label: "תאריך כניסה", value: row.entryDate });
  if (row.balconySqm != null) info.push({ label: "מרפסת", value: `${row.balconySqm} מ"ר` });
  if (row.totalFloors != null) info.push({ label: "קומות בבניין", value: String(row.totalFloors) });
  if (furnitureStatus)
    info.push({ label: "ריהוט", value: FURNITURE_STATUS_LABELS[furnitureStatus] });

  return (
    <main className="flex w-full max-w-2xl flex-col gap-4 sm:gap-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {row.formattedAddress ?? "דירה"}
        </h1>
        {meta.length > 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            <bdi>{meta.join(" · ")}</bdi>
          </p>
        ) : null}
      </header>

      {info.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">מידע נוסף על הנכס</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              {info.map((it) => (
                <div key={it.label} className="rounded-md bg-muted px-3 py-2">
                  <dt className="text-xs text-muted-foreground">{it.label}</dt>
                  <dd className="mt-0.5 font-medium">
                    <bdi>{it.value}</bdi>
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      ) : null}

      {row.sourceUrl ? (
        <div>
          <a
            href={row.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            צפייה במודעה במקור
          </a>
        </div>
      ) : null}
    </main>
  );
}
