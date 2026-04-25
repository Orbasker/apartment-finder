import { notFound } from "next/navigation";
import { getListingById } from "@/listings/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNis, relTime } from "@/lib/utils";
import { getRequestUser } from "@/lib/supabase/server";
import { FeedbackButtons } from "./feedback-buttons";
import { RejudgeButton } from "./rejudge-button";

export const dynamic = "force-dynamic";

export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listingId = Number(id);
  if (!Number.isFinite(listingId)) notFound();
  const user = await getRequestUser();
  if (!user) notFound();
  const listing = await getListingById(listingId, user.id);
  if (!listing) notFound();

  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
      <div className="space-y-4 sm:space-y-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl sm:text-2xl break-words">
              {listing.neighborhood ?? listing.title ?? "Listing"}
            </CardTitle>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="muted">{listing.source}</Badge>
              <span>{formatNis(listing.priceNis)}</span>
              {listing.rooms && <span>· {listing.rooms} rooms</span>}
              {listing.sqm && <span>· {listing.sqm} sqm</span>}
              {listing.floor != null && <span>· floor {listing.floor}</span>}
              <span>· {relTime(listing.ingestedAt)}</span>
            </div>
            {listing.street && <p className="mt-1 text-sm">{listing.street}</p>}
            <a
              href={listing.url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-sm underline hover:text-primary"
            >
              View original →
            </a>
          </CardHeader>
          <CardContent>
            {listing.description ? (
              <div className="prose whitespace-pre-wrap text-sm leading-relaxed">
                {listing.description}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No description.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-4 sm:space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>AI Judgment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {listing.score != null ? (
              <>
                <div className="flex items-center gap-2">
                  <Badge variant={listing.decision === "alert" ? "success" : "muted"}>
                    {listing.decision ?? "—"}
                  </Badge>
                  <span>score {listing.score}</span>
                </div>
                {listing.reasoning && <p className="text-muted-foreground">{listing.reasoning}</p>}
                {listing.positiveSignals && listing.positiveSignals.length > 0 && (
                  <div>
                    <p className="font-medium">Positives</p>
                    <ul className="list-disc pl-5 text-muted-foreground">
                      {listing.positiveSignals.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {listing.redFlags && listing.redFlags.length > 0 && (
                  <div>
                    <p className="font-medium">Red flags</p>
                    <ul className="list-disc pl-5 text-muted-foreground">
                      {listing.redFlags.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {listing.model && (
                  <p className="text-xs text-muted-foreground">via {listing.model}</p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">
                Not yet judged. Enable AI Gateway to see scoring.
              </p>
            )}
            <div className="pt-2">
              <RejudgeButton listingId={listing.id} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Feedback</CardTitle>
          </CardHeader>
          <CardContent>
            <FeedbackButtons listingId={listing.id} initial={listing.feedbackRating ?? null} />
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
