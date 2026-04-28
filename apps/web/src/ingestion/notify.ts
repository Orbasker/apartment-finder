import { and, eq, gte, sql } from "drizzle-orm";
import { Resend } from "resend";
import { getDb } from "@/db";
import { apartments, sentAlerts, user, userFilters } from "@/db/schema";
import { env } from "@/lib/env";
import { createLogger, errorMessage } from "@/lib/log";
import type { ApartmentAttributeKey } from "@apartment-finder/shared";
import { APARTMENT_ATTRIBUTE_LABELS } from "@apartment-finder/shared";

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

  // Already sent?
  const existing = await db
    .select({ apartmentId: sentAlerts.apartmentId })
    .from(sentAlerts)
    .where(and(eq(sentAlerts.userId, input.userId), eq(sentAlerts.apartmentId, input.apartmentId)))
    .limit(1);
  if (existing.length > 0) return { sent: false, reason: "already_sent" };

  // Cap check: count today's sends for the user.
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

  // Recipient address.
  const [u] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, input.userId))
    .limit(1);
  if (!u?.email) return { sent: false, reason: "no_email" };

  // Apartment payload.
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
    })
    .from(apartments)
    .where(eq(apartments.id, input.apartmentId))
    .limit(1);
  if (!apt) return { sent: false, reason: "error" };

  if (!env().RESEND_API_KEY) {
    log.warn("RESEND_API_KEY not set — skipping send", { userId: input.userId });
    return { sent: false, reason: "no_resend" };
  }

  const subject = buildSubject(apt);
  const html = buildHtml(apt, input.matchedAttributes);

  try {
    const result = await getResend().emails.send({
      from: env().RESEND_FROM_EMAIL || "Apartment Finder <apartment-finder@orbasker.com>",
      to: u.email,
      subject,
      html,
    });
    const messageId = (result as { data?: { id?: string } | null }).data?.id ?? null;
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

function buildHtml(
  apt: {
    id: number;
    neighborhood: string | null;
    formattedAddress: string | null;
    rooms: number | null;
    sqm: number | null;
    floor: number | null;
    priceNisLatest: number | null;
    primaryListingId: number | null;
  },
  matched: ApartmentAttributeKey[],
): string {
  const sourceUrl = apt.primaryListingId
    ? `${(env().NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "")}/listings/${apt.primaryListingId}`
    : null;
  const meta = [
    apt.priceNisLatest != null ? `<bdi>₪${apt.priceNisLatest.toLocaleString("he-IL")}</bdi>` : null,
    apt.rooms != null ? `<bdi>${apt.rooms} חדרים</bdi>` : null,
    apt.sqm != null ? `<bdi>${apt.sqm} מ"ר</bdi>` : null,
    apt.floor != null ? `<bdi>קומה ${apt.floor}</bdi>` : null,
    apt.neighborhood,
  ]
    .filter(Boolean)
    .join(" · ");
  const attrs =
    matched.length > 0
      ? `<p style="margin:8px 0;">תואם לסינונים שלך: ${matched
          .map((k) => APARTMENT_ATTRIBUTE_LABELS[k] ?? k)
          .join(" · ")}</p>`
      : "";
  return [
    '<div dir="rtl" style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.5;">',
    `<h2 style="margin:0 0 8px 0;">דירה חדשה תואמת לסינונים שלך</h2>`,
    apt.formattedAddress ? `<p style="margin:0;">${escapeHtml(apt.formattedAddress)}</p>` : "",
    `<p style="margin:8px 0;">${meta}</p>`,
    attrs,
    sourceUrl ? `<p><a href="${escapeHtml(sourceUrl)}">פתח את המודעה</a></p>` : "",
    "</div>",
  ]
    .filter(Boolean)
    .join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
