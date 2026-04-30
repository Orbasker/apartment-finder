import { Bot, GrammyError, HttpError } from "grammy";
import {
  APARTMENT_ATTRIBUTE_LABELS,
  FURNITURE_STATUS_LABELS,
  type ApartmentAttributeKey,
  type FurnitureStatus,
} from "@apartment-finder/shared";
import { env, requireEnv } from "@/lib/env";
import { createLogger, errorMessage } from "@/lib/log";

const log = createLogger("ingestion:telegram");

let cachedBot: Bot | undefined;

export function getBot(): Bot {
  if (cachedBot) return cachedBot;
  const token = requireEnv("TELEGRAM_BOT_TOKEN");
  cachedBot = new Bot(token);
  return cachedBot;
}

export function isTelegramConfigured(): boolean {
  return Boolean(env().TELEGRAM_BOT_TOKEN);
}

export type TelegramAlertProps = {
  chatId: string;
  neighborhood: string | null;
  formattedAddress: string | null;
  rooms: number | null;
  sqm: number | null;
  floor: number | null;
  priceNis: number | null;
  sourceUrl: string | null;
  matchedAttributes: ApartmentAttributeKey[];
  unverifiedAttributes: ApartmentAttributeKey[];
  pricePerSqm: number | null;
  arnonaNis: number | null;
  vaadBayitNis: number | null;
  condition: string | null;
  entryDate: string | null;
  balconySqm: number | null;
  totalFloors: number | null;
  furnitureStatus: FurnitureStatus | null;
};

export type TelegramSendResult =
  | { ok: true; messageId: number }
  | { ok: false; reason: "blocked" | "chat_not_found" | "rate_limited" | "error"; error: string };

/** Send a match alert as a Hebrew-RTL HTML message. */
export async function sendMatchAlert(props: TelegramAlertProps): Promise<TelegramSendResult> {
  const text = buildMessageHtml(props);
  try {
    const result = await getBot().api.sendMessage(props.chatId, text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: props.sourceUrl
        ? { inline_keyboard: [[{ text: "פתח את המודעה", url: props.sourceUrl }]] }
        : undefined,
    });
    return { ok: true, messageId: result.message_id };
  } catch (err) {
    return classifyError(err, props.chatId);
  }
}

/** Reply to the user after they hit /start with a valid link token. */
export async function sendLinkConfirmation(chatId: string): Promise<TelegramSendResult> {
  const text =
    "✅ <b>החיבור הצליח</b>\nמהרגע הזה תקבל/י כאן התראות על דירות שמתאימות לסינונים שלך.";
  try {
    const result = await getBot().api.sendMessage(chatId, text, { parse_mode: "HTML" });
    return { ok: true, messageId: result.message_id };
  } catch (err) {
    return classifyError(err, chatId);
  }
}

/** Reply when /start is sent without a token, with an expired token, or with an unknown one. */
export async function sendLinkFailure(
  chatId: string,
  reason: "missing" | "expired" | "already_consumed" | "not_found",
): Promise<TelegramSendResult> {
  const message =
    reason === "missing"
      ? "שלום! כדי לחבר את החשבון, צריך לפתוח את הקישור מתוך האתר (הכפתור 'התחבר ל־Telegram' בעמוד ההתראות)."
      : reason === "expired"
        ? "הקישור פג תוקף. חזרי לאתר ולחצי שוב על 'התחבר ל־Telegram' כדי לקבל קישור חדש."
        : reason === "already_consumed"
          ? "הקישור הזה כבר שומש. אם החשבון לא מחובר, צרי קישור חדש מהאתר."
          : "הקישור לא תקין. צרי קישור חדש מעמוד ההתראות באתר.";
  try {
    const result = await getBot().api.sendMessage(chatId, message);
    return { ok: true, messageId: result.message_id };
  } catch (err) {
    return classifyError(err, chatId);
  }
}

function classifyError(err: unknown, chatId: string): TelegramSendResult {
  const error = errorMessage(err);
  if (err instanceof GrammyError) {
    const code = err.error_code;
    const desc = err.description;
    log.warn("telegram api error", { chatId, code, desc });
    if (code === 403) return { ok: false, reason: "blocked", error: desc };
    if (code === 400 && /chat not found/i.test(desc))
      return { ok: false, reason: "chat_not_found", error: desc };
    if (code === 429) return { ok: false, reason: "rate_limited", error: desc };
  } else if (err instanceof HttpError) {
    log.warn("telegram http error", { chatId, error });
  } else {
    log.warn("telegram unknown error", { chatId, error });
  }
  return { ok: false, reason: "error", error };
}

export function buildMessageHtml(p: TelegramAlertProps): string {
  const lines: string[] = [];

  lines.push("<b>דירה חדשה תואמת לסינונים שלך</b>");
  if (p.formattedAddress) lines.push(escapeHtml(p.formattedAddress));

  const meta = buildMeta(p);
  if (meta) lines.push(meta);

  const additional = buildAdditionalInfo(p);
  if (additional) {
    lines.push("");
    lines.push("<b>מידע נוסף על הנכס</b>");
    lines.push(additional);
  }

  if (p.matchedAttributes.length > 0) {
    lines.push("");
    lines.push("<i>תואם לסינונים שלך:</i>");
    lines.push(
      escapeHtml(p.matchedAttributes.map((k) => APARTMENT_ATTRIBUTE_LABELS[k] ?? k).join(" · ")),
    );
  }

  if (p.unverifiedAttributes.length > 0) {
    lines.push("");
    lines.push("<i>לא הצלחנו לאמת מהמודעה (כדאי לבדוק במודעה עצמה):</i>");
    lines.push(
      escapeHtml(p.unverifiedAttributes.map((k) => APARTMENT_ATTRIBUTE_LABELS[k] ?? k).join(" · ")),
    );
  }

  return lines.join("\n");
}

function buildMeta(p: TelegramAlertProps): string | null {
  const segs: string[] = [];
  if (p.priceNis != null) segs.push(`₪${p.priceNis.toLocaleString("he-IL")}`);
  if (p.rooms != null) segs.push(`${p.rooms} חדרים`);
  if (p.sqm != null) segs.push(`${p.sqm} מ"ר`);
  if (p.floor != null) segs.push(`קומה ${p.floor}`);
  if (p.neighborhood) segs.push(p.neighborhood);
  return segs.length > 0 ? escapeHtml(segs.join(" · ")) : null;
}

function buildAdditionalInfo(p: TelegramAlertProps): string | null {
  const rows: string[] = [];
  if (p.pricePerSqm != null) rows.push(`מחיר למ"ר: ₪${p.pricePerSqm.toLocaleString("he-IL")}`);
  if (p.arnonaNis != null) rows.push(`ארנונה: ₪${p.arnonaNis.toLocaleString("he-IL")}`);
  if (p.vaadBayitNis != null) rows.push(`ועד בית: ₪${p.vaadBayitNis.toLocaleString("he-IL")}`);
  if (p.condition) rows.push(`מצב הנכס: ${p.condition}`);
  if (p.entryDate) rows.push(`תאריך כניסה: ${p.entryDate}`);
  if (p.balconySqm != null) rows.push(`מרפסת: ${p.balconySqm} מ"ר`);
  if (p.totalFloors != null) rows.push(`קומות בבניין: ${p.totalFloors}`);
  if (p.furnitureStatus) rows.push(`ריהוט: ${FURNITURE_STATUS_LABELS[p.furnitureStatus]}`);
  if (rows.length === 0) return null;
  return rows.map((r) => escapeHtml(r)).join("\n");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
