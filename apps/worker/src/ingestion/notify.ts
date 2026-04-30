import { and, eq, gte, sql } from "drizzle-orm";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { getDb } from "../db/index.js";
import { apartments, listingExtractions, listings, sentAlerts, user, userFilters } from "../db/schema.js";
import { env } from "../lib/env.js";
import { createLogger, errorMessage } from "../lib/log.js";
import {
  FurnitureStatusSchema,
  type ApartmentAttributeKey,
  type FurnitureStatus,
} from "@apartment-finder/shared";
import { MatchAlertEmail, type MatchAlertProps } from "../emails/MatchAlert.js";
import { activeChannels, loadDestinations } from "../notifications/destinations.js";
import {
  isTelegramConfigured,
  sendMatchAlert as sendTelegramMatchAlert,
} from "./telegram.js";

const log = createLogger("ingestion:notify");

let resendClient: Resend | undefined;

function getResend(): Resend {
  if (resendClient) return resendClient;
  const key = env().RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not set");
  resendClient = new Resend(key);
  return resendClient;
}

export type NotifyChannel = "email" | "telegram";

export type NotifyChannelOutcome =
  | { channel: NotifyChannel; status: "sent"; messageId: string | null }
  | {
      channel: NotifyChannel;
      status: "skipped";
      reason: "already_sent" | "cap_reached" | "channel_off" | "channel_unconfigured";
    }
  | { channel: NotifyChannel; status: "failed"; error: string };

export type NotifyOutcome = {
  channels: NotifyChannelOutcome[];
};

export async function sendInstantAlert(input: {
  userId: string;
  apartmentId: number;
  matchedAttributes: ApartmentAttributeKey[];
  unverifiedAttributes: ApartmentAttributeKey[];
}): Promise<NotifyOutcome> {
  const db = getDb();

  const destinations = await loadDestinations(input.userId);
  const channels = activeChannels(destinations);
  if (channels.length === 0) {
    log.warn("no active channels - skipping", { userId: input.userId });
    return { channels: [] };
  }

  // Daily cap is computed across all destinations for the user.
  const [filter] = await db
    .select({ dailyAlertCap: userFilters.dailyAlertCap })
    .from(userFilters)
    .where(eq(userFilters.userId, input.userId))
    .limit(1);
  const cap = filter?.dailyAlertCap ?? 20;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  // Count distinct apartments, not rows: with per-channel sent_alerts rows a
  // dual-channel user would otherwise burn 2 cap units per match.
  const [today] = await db
    .select({ count: sql<number>`count(distinct ${sentAlerts.apartmentId})::int` })
    .from(sentAlerts)
    .where(and(eq(sentAlerts.userId, input.userId), gte(sentAlerts.sentAt, since)));
  if ((today?.count ?? 0) >= cap) {
    return {
      channels: channels.map((c) => ({ channel: c, status: "skipped", reason: "cap_reached" })),
    };
  }

  // Pre-load apartment details once; both senders need them.
  const apt = await loadApartmentForAlert(input.apartmentId);
  if (!apt) {
    log.warn("apartment not found", { apartmentId: input.apartmentId });
    return {
      channels: channels.map((c) => ({
        channel: c,
        status: "failed",
        error: "apartment_not_found",
      })),
    };
  }

  const outcomes: NotifyChannelOutcome[] = [];
  for (const channel of channels) {
    const alreadySent = await db
      .select({ apartmentId: sentAlerts.apartmentId })
      .from(sentAlerts)
      .where(
        and(
          eq(sentAlerts.userId, input.userId),
          eq(sentAlerts.apartmentId, input.apartmentId),
          eq(sentAlerts.destination, channel),
        ),
      )
      .limit(1);
    if (alreadySent.length > 0) {
      outcomes.push({ channel, status: "skipped", reason: "already_sent" });
      continue;
    }

    if (channel === "email") {
      outcomes.push(
        await sendEmail({
          userId: input.userId,
          apartmentId: input.apartmentId,
          matchedAttributes: input.matchedAttributes,
          unverifiedAttributes: input.unverifiedAttributes,
          apartment: apt,
        }),
      );
    } else if (channel === "telegram") {
      outcomes.push(
        await sendTelegram({
          userId: input.userId,
          apartmentId: input.apartmentId,
          matchedAttributes: input.matchedAttributes,
          unverifiedAttributes: input.unverifiedAttributes,
          apartment: apt,
          chatId: destinations.telegramChatId!,
        }),
      );
    }
  }

  return { channels: outcomes };
}

type ApartmentDetails = {
  id: number;
  neighborhood: string | null;
  formattedAddress: string | null;
  rooms: number | null;
  sqm: number | null;
  floor: number | null;
  priceNisLatest: number | null;
  primaryListingId: number | null;
  listingUrl: string | null;
  condition: string | null;
  arnonaNis: number | null;
  vaadBayitNis: number | null;
  entryDate: string | null;
  balconySqm: number | null;
  totalFloors: number | null;
  furnitureStatus: FurnitureStatus | null;
  pricePerSqm: number | null;
};

async function loadApartmentForAlert(apartmentId: number): Promise<ApartmentDetails | null> {
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
      primaryListingId: apartments.primaryListingId,
      listingUrl: listings.url,
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
  if (!row) return null;
  const pricePerSqm =
    row.priceNisLatest != null && row.sqm != null && row.sqm > 0
      ? Math.round(row.priceNisLatest / row.sqm)
      : null;
  const furnitureStatusParsed = FurnitureStatusSchema.safeParse(row.furnitureStatus);
  const furnitureStatus = furnitureStatusParsed.success ? furnitureStatusParsed.data : null;
  return { ...row, pricePerSqm, furnitureStatus };
}

function buildSourceUrl(apt: ApartmentDetails): string | null {
  return apt.listingUrl ?? null;
}

async function sendEmail(args: {
  userId: string;
  apartmentId: number;
  matchedAttributes: ApartmentAttributeKey[];
  unverifiedAttributes: ApartmentAttributeKey[];
  apartment: ApartmentDetails;
}): Promise<NotifyChannelOutcome> {
  const channel: NotifyChannel = "email";
  const db = getDb();

  const [u] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, args.userId))
    .limit(1);
  if (!u?.email) return { channel, status: "skipped", reason: "channel_off" };

  const apiKey = env().RESEND_API_KEY;
  const from = env().RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    log.warn("resend env not set - skipping email", { userId: args.userId });
    return { channel, status: "skipped", reason: "channel_unconfigured" };
  }

  const apt = args.apartment;
  const siteOrigin = (env().APP_PUBLIC_ORIGIN ?? "").replace(/\/$/, "");
  const filtersUrl = siteOrigin ? `${siteOrigin}/filters` : null;
  const sourceUrl = buildSourceUrl(apt);

  const subject = buildSubject({
    neighborhood: apt.neighborhood,
    rooms: apt.rooms,
    priceNisLatest: apt.priceNisLatest,
  });

  const emailProps: MatchAlertProps = {
    apartmentId: apt.id,
    neighborhood: apt.neighborhood,
    formattedAddress: apt.formattedAddress,
    rooms: apt.rooms,
    sqm: apt.sqm,
    floor: apt.floor,
    priceNis: apt.priceNisLatest,
    sourceUrl,
    filtersUrl,
    matchedAttributes: args.matchedAttributes,
    unverifiedAttributes: args.unverifiedAttributes,
    pricePerSqm: apt.pricePerSqm,
    arnonaNis: apt.arnonaNis,
    vaadBayitNis: apt.vaadBayitNis,
    condition: apt.condition,
    entryDate: apt.entryDate,
    balconySqm: apt.balconySqm,
    totalFloors: apt.totalFloors,
    furnitureStatus: apt.furnitureStatus,
  };
  const html = await render(MatchAlertEmail(emailProps));
  const text = await render(MatchAlertEmail(emailProps), { plainText: true });

  try {
    const result = await getResend().emails.send({ from, to: u.email, subject, html, text });
    if (result.error) {
      log.error("alert rejected by Resend", {
        userId: args.userId,
        apartmentId: args.apartmentId,
        from,
        error: result.error.message ?? String(result.error),
      });
      return { channel, status: "failed", error: result.error.message ?? "resend_error" };
    }
    const messageId = result.data?.id ?? null;
    await db.insert(sentAlerts).values({
      userId: args.userId,
      apartmentId: args.apartmentId,
      destination: "email",
      providerMessageId: messageId,
    });
    log.info("email alert sent", {
      userId: args.userId,
      apartmentId: args.apartmentId,
      messageId,
    });
    return { channel, status: "sent", messageId };
  } catch (err) {
    log.error("email alert send failed", {
      userId: args.userId,
      apartmentId: args.apartmentId,
      error: errorMessage(err),
    });
    return { channel, status: "failed", error: errorMessage(err) };
  }
}

async function sendTelegram(args: {
  userId: string;
  apartmentId: number;
  matchedAttributes: ApartmentAttributeKey[];
  unverifiedAttributes: ApartmentAttributeKey[];
  apartment: ApartmentDetails;
  chatId: string;
}): Promise<NotifyChannelOutcome> {
  const channel: NotifyChannel = "telegram";
  const db = getDb();

  if (!isTelegramConfigured()) {
    log.warn("telegram env not set - skipping", { userId: args.userId });
    return { channel, status: "skipped", reason: "channel_unconfigured" };
  }

  const apt = args.apartment;
  const sourceUrl = buildSourceUrl(apt);

  const result = await sendTelegramMatchAlert({
    chatId: args.chatId,
    neighborhood: apt.neighborhood,
    formattedAddress: apt.formattedAddress,
    rooms: apt.rooms,
    sqm: apt.sqm,
    floor: apt.floor,
    priceNis: apt.priceNisLatest,
    sourceUrl,
    matchedAttributes: args.matchedAttributes,
    unverifiedAttributes: args.unverifiedAttributes,
    pricePerSqm: apt.pricePerSqm,
    arnonaNis: apt.arnonaNis,
    vaadBayitNis: apt.vaadBayitNis,
    condition: apt.condition,
    entryDate: apt.entryDate,
    balconySqm: apt.balconySqm,
    totalFloors: apt.totalFloors,
    furnitureStatus: apt.furnitureStatus,
  });

  if (!result.ok) {
    log.error("telegram alert send failed", {
      userId: args.userId,
      apartmentId: args.apartmentId,
      reason: result.reason,
      error: result.error,
    });
    return { channel, status: "failed", error: `${result.reason}:${result.error}` };
  }

  await db.insert(sentAlerts).values({
    userId: args.userId,
    apartmentId: args.apartmentId,
    destination: "telegram",
    providerMessageId: String(result.messageId),
  });
  log.info("telegram alert sent", {
    userId: args.userId,
    apartmentId: args.apartmentId,
    messageId: result.messageId,
  });
  return { channel, status: "sent", messageId: String(result.messageId) };
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
