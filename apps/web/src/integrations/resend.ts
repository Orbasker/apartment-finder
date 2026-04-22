import { Resend } from "resend";
import type { Judgment, NormalizedListing } from "@apartment-finder/shared";
import { env } from "@/lib/env";
import { getAlertEmailTargets, loadPreferences } from "@/preferences/store";

let resendClient: Resend | undefined;

export function isResendConfigured(): boolean {
  return Boolean(env().RESEND_API_KEY);
}

function getClient(): Resend {
  if (resendClient) return resendClient;
  const key = env().RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not set");
  resendClient = new Resend(key);
  return resendClient;
}

type EmailInput = {
  listingId: number;
  listing: NormalizedListing;
  summary?: string;
  judgment?: Judgment;
};

type RunSummaryEmailInput = {
  job: string;
  status: "ok" | "skipped" | "error";
  details: Record<string, unknown>;
};

export async function sendEmailAlert(input: EmailInput): Promise<void> {
  const prefs = await loadPreferences();
  const to = getAlertEmailTargets(prefs);
  if (!prefs.alerts.email.enabled || to.length === 0) return;

  const subject = input.listing.title
    ? `TA apt: ${input.listing.title.slice(0, 80)}`
    : `TA apt: ${input.listing.neighborhood ?? ""} ₪${input.listing.priceNis ?? "?"}`;

  const parts: string[] = [
    `<h2>${escape(subject)}</h2>`,
    input.listing.priceNis
      ? `<p><strong>₪${input.listing.priceNis}</strong> · ${escape(String(input.listing.rooms ?? "?"))} rooms · ${escape(input.listing.neighborhood ?? "")}</p>`
      : "",
    input.summary ? `<p>${escape(input.summary)}</p>` : "",
    input.judgment?.reasoning ? `<p><em>${escape(input.judgment.reasoning)}</em></p>` : "",
    input.judgment?.redFlags.length
      ? `<p>⚠︎ ${input.judgment.redFlags.map(escape).join(" · ")}</p>`
      : "",
    `<p><a href="${escape(input.listing.url)}">View listing</a></p>`,
  ];

  await getClient().emails.send({
    from: getFromAddress(),
    to,
    subject,
    html: parts.filter(Boolean).join("\n"),
  });
}

export async function sendRunSummaryEmail(input: RunSummaryEmailInput): Promise<void> {
  const prefs = await loadPreferences();
  const to = getAlertEmailTargets(prefs);
  if (!prefs.alerts.email.runSummaryEnabled || to.length === 0 || !isResendConfigured()) return;

  const subject = `Apartment Finder: ${input.job} ${input.status}`;
  const rows = Object.entries(input.details).map(
    ([key, value]) =>
      `<tr><td style="padding:4px 12px 4px 0;"><strong>${escape(formatKey(key))}</strong></td><td style="padding:4px 0;">${escape(formatValue(value))}</td></tr>`,
  );

  await getClient().emails.send({
    from: getFromAddress(),
    to,
    subject,
    html: [
      `<h2>${escape(input.job)}</h2>`,
      `<p>Status: <strong>${escape(input.status)}</strong></p>`,
      `<table cellpadding="0" cellspacing="0">${rows.join("")}</table>`,
    ].join("\n"),
  });
}

function getFromAddress(): string {
  return env().RESEND_FROM_EMAIL || "Apartment Finder <apartment-finder@orbasker.com>";
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (char) => char.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}
