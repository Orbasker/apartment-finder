import { Resend } from "resend";
import type { Judgment, NormalizedListing } from "@apartment-finder/shared";
import { env } from "@/lib/env";
import { loadPreferences } from "@/preferences/store";

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

export async function sendEmailAlert(input: EmailInput): Promise<void> {
  const prefs = await loadPreferences();
  const to = prefs.alerts.email.to;
  if (!prefs.alerts.email.enabled || !to) return;

  const from =
    env().NODE_ENV === "production"
      ? "Apartment Finder <alerts@resend.dev>"
      : "onboarding@resend.dev";

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
    from,
    to,
    subject,
    html: parts.filter(Boolean).join("\n"),
  });
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
