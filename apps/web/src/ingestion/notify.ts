import { and, eq, gte, sql } from "drizzle-orm";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { getDb } from "@/db";
import { apartments, listingExtractions, sentAlerts, user, userFilters } from "@/db/schema";
import { env } from "@/lib/env";
import { createLogger, errorMessage } from "@/lib/log";
import {
  FurnitureStatusSchema,
  type ApartmentAttributeKey,
  type FurnitureStatus,
} from "@apartment-finder/shared";
import { MatchAlertEmail } from "@/emails/MatchAlert";

const log = createLogger("ingestion:notify");

let resendClient: Resend | undefined;

function getResend(): Resend {
  if (resendClient) return resendClient;
  const key = env().RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not set");
  resendClient = new Resend(key);
  return resendClient;
}

export type NotifyOutcome =
  | { sent: true; messageId: string | null }
  | { sent: false; reason: "no_email" | "already_sent" | "cap_reached" | "no_resend" | "error" };

export async function sendInstantAlert(input: {
  userId: string;
  apartmentId: number;
  matchedAttributes: ApartmentAttributeKey[];
}): Promise<NotifyOutcome> {
  const db = getDb();

  const existing = await db
    .select({ apartmentId: sentAlerts.apartmentId })
    .from(sentAlerts)
    .where(and(eq(sentAlerts.userId, input.userId), eq(sentAlerts.apartmentId, input.apartmentId)))
    .limit(1);
  if (existing.length > 0) return { sent: false, reason: "already_sent" };

  const [filter] = await db
    .select({ dailyAlertCap: userFilters.dailyAlertCap })
    .from(userFilters)
    .where(eq(userFilters.userId, input.userId))
    .limit(1);
  const cap = filter?.dailyAlertCap ?? 20;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [today] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sentAlerts)
    .where(and(eq(sentAlerts.userId, input.userId), gte(sentAlerts.sentAt, since)));
  if ((today?.count ?? 0) >= cap) return { sent: false, reason: "cap_reached" };

  const [u] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, input.userId))
    .limit(1);
  if (!u?.email) return { sent: false, reason: "no_email" };

  const [apt] = await db
    .select({
      id: apartments.id,
      neighborhood: apartments.neighborhood,
      formattedAddress: apartments.formattedAddress,
      rooms: apartments.rooms,
      sqm: apartments.sqm,
      floor: apartments.floor,
      priceNisLatest: apartments.priceNisLatest,
      primaryListingId: apartments.primaryListingId,
      condition: listingExtractions.condition,
      arnonaNis: listingExtractions.arnonaNis,
      vaadBayitNis: listingExtractions.vaadBayitNis,
      entryDate: listingExtractions.entryDate,
      balconySqm: listingExtractions.balconySqm,
      totalFloors: listingExtractions.totalFloors,
      furnitureStatus: listingExtractions.furnitureStatus,
    })
    .from(apartments)
    .leftJoin(listingExtractions, eq(listingExtractions.listingId, apartments.primaryListingId))
    .where(eq(apartments.id, input.apartmentId))
    .limit(1);
  if (!apt) return { sent: false, reason: "error" };

  const pricePerSqm =
    apt.priceNisLatest != null && apt.sqm != null && apt.sqm > 0
      ? Math.round(apt.priceNisLatest / apt.sqm)
      : null;
  const furnitureStatusParsed = FurnitureStatusSchema.safeParse(apt.furnitureStatus);
  const furnitureStatus: FurnitureStatus | null = furnitureStatusParsed.success
    ? furnitureStatusParsed.data
    : null;

  if (!env().RESEND_API_KEY) {
    log.warn("RESEND_API_KEY not set - skipping send", { userId: input.userId });
    return { sent: false, reason: "no_resend" };
  }
  const from = env().RESEND_FROM_EMAIL;
  if (!from) {
    log.warn("RESEND_FROM_EMAIL not set - skipping send", { userId: input.userId });
    return { sent: false, reason: "no_resend" };
  }

  const siteOrigin = (env().NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const sourceUrl =
    apt.primaryListingId && siteOrigin ? `${siteOrigin}/listings/${apt.primaryListingId}` : null;
  const filtersUrl = siteOrigin ? `${siteOrigin}/filters` : null;

  const subject = buildSubject({
    neighborhood: apt.neighborhood,
    rooms: apt.rooms,
    priceNisLatest: apt.priceNisLatest,
  });

  const emailProps = {
    apartmentId: apt.id,
    neighborhood: apt.neighborhood,
    formattedAddress: apt.formattedAddress,
    rooms: apt.rooms,
    sqm: apt.sqm,
    floor: apt.floor,
    priceNis: apt.priceNisLatest,
    sourceUrl,
    filtersUrl,
    matchedAttributes: input.matchedAttributes,
    pricePerSqm,
    arnonaNis: apt.arnonaNis,
    vaadBayitNis: apt.vaadBayitNis,
    condition: apt.condition,
    entryDate: apt.entryDate,
    balconySqm: apt.balconySqm,
    totalFloors: apt.totalFloors,
    furnitureStatus,
  } as const;
  const html = await render(MatchAlertEmail(emailProps));
  const text = await render(MatchAlertEmail(emailProps), { plainText: true });

  try {
    const result = await getResend().emails.send({
      from,
      to: u.email,
      subject,
      html,
      text,
    });
    if (result.error) {
      log.error("alert rejected by Resend", {
        userId: input.userId,
        apartmentId: input.apartmentId,
        from,
        error: result.error.message ?? String(result.error),
      });
      return { sent: false, reason: "error" };
    }
    const messageId = result.data?.id ?? null;
    await db.insert(sentAlerts).values({
      userId: input.userId,
      apartmentId: input.apartmentId,
      resendMessageId: messageId,
    });
    log.info("alert sent", { userId: input.userId, apartmentId: input.apartmentId, messageId });
    return { sent: true, messageId };
  } catch (err) {
    log.error("alert send failed", {
      userId: input.userId,
      apartmentId: input.apartmentId,
      error: errorMessage(err),
    });
    return { sent: false, reason: "error" };
  }
}

function buildSubject(apt: {
  neighborhood: string | null;
  rooms: number | null;
  priceNisLatest: number | null;
}): string {
  const parts: string[] = ["דירה חדשה"];
  if (apt.neighborhood) parts.push(`ב${apt.neighborhood}`);
  if (apt.rooms != null) parts.push(`${apt.rooms} חדרים`);
  if (apt.priceNisLatest != null) parts.push(`₪${apt.priceNisLatest.toLocaleString("he-IL")}`);
  return parts.join(" · ");
}
