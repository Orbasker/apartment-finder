import Link from "next/link";
import { searchListings } from "@/listings/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatNis, relTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardHomePage() {
  const [alertsToday, recent] = await Promise.all([
    searchListings({ decision: "alert", hoursAgo: 24, limit: 30 }),
    searchListings({ limit: 50 }),
  ]);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-xl font-semibold">
          Today's alerts ({alertsToday.length})
        </h2>
        {alertsToday.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing matched yet in the last 24 hours.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {alertsToday.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Recently ingested</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted text-left">
              <tr>
                <th className="p-2">When</th>
                <th className="p-2">Source</th>
                <th className="p-2">Price</th>
                <th className="p-2">Rooms</th>
                <th className="p-2">Neighborhood</th>
                <th className="p-2">Score</th>
                <th className="p-2">Decision</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {recent.map((l) => (
                <tr key={l.id} className="border-t hover:bg-muted/50">
                  <td className="p-2 text-muted-foreground">{relTime(l.ingestedAt)}</td>
                  <td className="p-2">
                    <Badge variant="muted">{l.source}</Badge>
                  </td>
                  <td className="p-2">{formatNis(l.priceNis)}</td>
                  <td className="p-2">{l.rooms ?? "—"}</td>
                  <td className="p-2">{l.neighborhood ?? "—"}</td>
                  <td className="p-2">{l.score ?? "—"}</td>
                  <td className="p-2">
                    {l.decision ? <DecisionBadge decision={l.decision} /> : "—"}
                  </td>
                  <td className="p-2">
                    <Link
                      href={`/dashboard/listings/${l.id}`}
                      className="text-sm underline hover:text-primary"
                    >
                      open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function DecisionBadge({ decision }: { decision: string }) {
  if (decision === "alert") return <Badge variant="success">alert</Badge>;
  if (decision === "skip") return <Badge variant="muted">skip</Badge>;
  return <Badge variant="muted">unsure</Badge>;
}

function ListingCard({ listing }: { listing: Awaited<ReturnType<typeof searchListings>>[number] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="truncate text-base">
          {listing.neighborhood ?? listing.title ?? "Listing"}
        </CardTitle>
        <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
          <span>{formatNis(listing.priceNis)}</span>
          {listing.rooms && <span>· {listing.rooms} rooms</span>}
          {listing.score != null && <span>· score {listing.score}</span>}
        </div>
      </CardHeader>
      <CardContent>
        <p className="line-clamp-3 text-sm text-muted-foreground">
          {listing.reasoning ?? listing.description ?? ""}
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{relTime(listing.ingestedAt)}</span>
          <Link
            href={`/dashboard/listings/${listing.id}`}
            className="text-sm underline hover:text-primary"
          >
            open
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
