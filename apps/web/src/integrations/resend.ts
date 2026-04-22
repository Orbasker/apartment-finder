import { Resend } from "resend";
import type { Judgment, NormalizedListing } from "@apartment-finder/shared";
import { env } from "@/lib/env";
import type { AiUsageSummary } from "@/lib/aiUsage";
import { getScheduleTimeZone } from "@/lib/schedule";
import { getAlertEmailTargets, loadPreferences } from "@/preferences/store";
import {
  hasAlertBeenSent,
  recordAlertSent,
  type AlertEntry,
} from "@/pipeline/sentAlerts";
import type { ResolvedTopPick } from "@/pipeline/topPicks";

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
  alerts?: AlertEntry[];
};

export function hasAdminSummaryRecipients(): boolean {
  return getAdminSummaryRecipients().length > 0;
}

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
  if (!isResendConfigured()) return;

  const prefs = await loadPreferences();
  const to = getAlertEmailTargets(prefs);
  if (to.length === 0) return;

  const freshAlerts = await filterUnsentEmailAlerts(input.alerts ?? []);
  const hasAlerts = freshAlerts.length > 0;
  const alertEmailsEnabled = prefs.alerts.email.enabled;
  const runSummaryEnabled = prefs.alerts.email.runSummaryEnabled;

  if (!runSummaryEnabled && !(hasAlerts && alertEmailsEnabled)) return;

  const alertsToShow = alertEmailsEnabled ? freshAlerts : [];
  const alertCount = alertsToShow.length;
  const subject = alertCount > 0
    ? `Apartment Finder: ${input.job} · ${alertCount} match${alertCount === 1 ? "" : "es"}`
    : `Apartment Finder: ${input.job} ${input.status}`;

  const rows = Object.entries(input.details).map(
    ([key, value]) =>
      `<tr><td style="padding:4px 12px 4px 0;"><strong>${escape(formatKey(key))}</strong></td><td style="padding:4px 0;">${escape(formatValue(value))}</td></tr>`,
  );

  const html = [
    `<h2>${escape(input.job)}</h2>`,
    `<p>Status: <strong>${escape(input.status)}</strong></p>`,
    alertsToShow.length > 0 ? renderAlertsSection(alertsToShow) : "",
    `<h3>Run details</h3>`,
    `<table cellpadding="0" cellspacing="0">${rows.join("")}</table>`,
  ]
    .filter(Boolean)
    .join("\n");

  await getClient().emails.send({
    from: getFromAddress(),
    to,
    subject,
    html,
  });

  await Promise.all(
    alertsToShow.map((entry) => recordAlertSent(entry.listingId, "email")),
  );
}

async function filterUnsentEmailAlerts(alerts: AlertEntry[]): Promise<AlertEntry[]> {
  const results = await Promise.all(
    alerts.map(async (entry) => ({
      entry,
      sent: await hasAlertBeenSent(entry.listingId, "email"),
    })),
  );
  return results.filter((r) => !r.sent).map((r) => r.entry);
}

function renderAlertsSection(alerts: AlertEntry[]): string {
  const items = alerts
    .map((entry) => {
      const { listing, summary, judgment, reason } = entry;
      const title = listing.title || listing.neighborhood || "Listing";
      const priceLine = [
        listing.priceNis ? `₪${formatInteger(listing.priceNis)}` : null,
        listing.rooms != null ? `${listing.rooms} rooms` : null,
        listing.sqm != null ? `${listing.sqm} sqm` : null,
        listing.neighborhood,
      ]
        .filter(Boolean)
        .map((value) => escape(String(value)))
        .join(" · ");

      return [
        "<li style=\"margin-bottom:16px;\">",
        `<div><strong>${escape(title)}</strong>${judgment ? ` · score ${escape(String(judgment.score))}` : ""}</div>`,
        priceLine ? `<div>${priceLine}</div>` : "",
        summary ? `<div>${escape(summary)}</div>` : "",
        judgment?.reasoning ? `<div><em>${escape(judgment.reasoning)}</em></div>` : "",
        judgment?.redFlags?.length
          ? `<div>⚠︎ ${judgment.redFlags.map(escape).join(" · ")}</div>`
          : "",
        reason ? `<div><em>${escape(reason)}</em></div>` : "",
        `<div><a href="${escape(listing.url)}">View listing</a></div>`,
        "</li>",
      ]
        .filter(Boolean)
        .join("");
    })
    .join("");

  return [
    `<h3>New matches (${alerts.length})</h3>`,
    `<ul style="padding-left:20px;">${items}</ul>`,
  ].join("\n");
}

export type TopPicksEmailInput = {
  picks: ResolvedTopPick[];
  summary?: string;
  hoursAgo: number;
  candidateCount: number;
};

export async function sendTopPicksEmail(input: TopPicksEmailInput): Promise<void> {
  if (!isResendConfigured()) return;
  const prefs = await loadPreferences();
  const to = getAlertEmailTargets(prefs);
  if (to.length === 0) return;

  const subject = input.picks.length > 0
    ? `Apartment Finder: Top ${input.picks.length} picks · last ${input.hoursAgo}h`
    : `Apartment Finder: No standout picks · last ${input.hoursAgo}h`;

  const intro = input.summary
    ? `<p>${escape(input.summary)}</p>`
    : input.picks.length === 0
      ? `<p>Nothing stood out across ${formatInteger(input.candidateCount)} recent listings.</p>`
      : "";

  const html = [
    `<h2>Top picks · last ${escape(String(input.hoursAgo))}h</h2>`,
    `<p><small>Scanned ${formatInteger(input.candidateCount)} recent listings.</small></p>`,
    intro,
    renderTopPicks(input.picks),
  ]
    .filter(Boolean)
    .join("\n");

  await getClient().emails.send({
    from: getFromAddress(),
    to,
    subject,
    html,
  });
}

function renderTopPicks(picks: ResolvedTopPick[]): string {
  if (picks.length === 0) return "";
  const items = picks
    .map((pick) => {
      const l = pick.listing;
      const meta = [
        l.priceNis ? `₪${formatInteger(l.priceNis)}` : null,
        l.rooms != null ? `${l.rooms} rooms` : null,
        l.sqm != null ? `${l.sqm} sqm` : null,
        l.neighborhood,
      ]
        .filter(Boolean)
        .map((v) => escape(String(v)))
        .join(" · ");

      return [
        '<li style="margin-bottom:16px;">',
        `<div><strong>#${escape(String(pick.rank))} · ${escape(pick.headline)}</strong>${l.score != null ? ` · score ${escape(String(l.score))}` : ""}</div>`,
        meta ? `<div>${meta}</div>` : "",
        `<div><em>${escape(pick.reasoning)}</em></div>`,
        pick.concerns.length > 0
          ? `<div>⚠︎ ${pick.concerns.map(escape).join(" · ")}</div>`
          : "",
        `<div><a href="${escape(l.url)}">View listing</a></div>`,
        "</li>",
      ]
        .filter(Boolean)
        .join("");
    })
    .join("");

  return `<ol style="padding-left:20px;">${items}</ol>`;
}

export async function sendAdminCostSummaryEmail(summary: AiUsageSummary): Promise<void> {
  const to = getAdminSummaryRecipients();
  if (to.length === 0 || !isResendConfigured()) return;

  const subject = `Apartment Finder admin cost summary · $${formatUsd(summary.estimatedCostUsd)}`;

  await getClient().emails.send({
    from: getFromAddress(),
    to,
    subject,
    html: [
      `<h2>Apartment Finder admin cost summary</h2>`,
      `<p>${escape(formatWindow(summary.windowStart, summary.windowEnd))}</p>`,
      renderMetricTable([
        ["Estimated cost", `$${formatUsd(summary.estimatedCostUsd)}`],
        ["AI calls", formatInteger(summary.totalCalls)],
        ["Input tokens", formatInteger(summary.inputTokens)],
        ["Output tokens", formatInteger(summary.outputTokens)],
        ["Total tokens", formatInteger(summary.totalTokens)],
        ["Unpriced calls", formatInteger(summary.unpricedCalls)],
      ]),
      `<h3>By feature</h3>`,
      renderBreakdownTable(summary.byFeature),
      `<h3>By model</h3>`,
      renderBreakdownTable(summary.byModel),
    ].join("\n"),
  });
}

function getFromAddress(): string {
  return env().RESEND_FROM_EMAIL || "Apartment Finder <apartment-finder@orbasker.com>";
}

function getAdminSummaryRecipients(): string[] {
  return (env().ADMIN_SUMMARY_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
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

function formatWindow(start: Date, end: Date): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: getScheduleTimeZone(),
  });

  return `Window: ${fmt.format(start)} → ${fmt.format(end)} (${getScheduleTimeZone()})`;
}

function renderMetricTable(rows: Array<[string, string]>): string {
  return `<table cellpadding="0" cellspacing="0">${rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 12px 4px 0;"><strong>${escape(label)}</strong></td><td style="padding:4px 0;">${escape(value)}</td></tr>`,
    )
    .join("")}</table>`;
}

function renderBreakdownTable(
  rows: Array<{
    label: string;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
  }>,
): string {
  if (rows.length === 0) {
    return "<p>No AI activity in this window.</p>";
  }

  return [
    '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">',
    "<thead><tr>",
    '<th align="left" style="padding:4px 16px 4px 0;">Name</th>',
    '<th align="right" style="padding:4px 16px 4px 0;">Calls</th>',
    '<th align="right" style="padding:4px 16px 4px 0;">Input</th>',
    '<th align="right" style="padding:4px 16px 4px 0;">Output</th>',
    '<th align="right" style="padding:4px 16px 4px 0;">Total</th>',
    '<th align="right" style="padding:4px 0;">Est. cost</th>',
    "</tr></thead>",
    "<tbody>",
    rows
      .map(
        (row) =>
          `<tr><td style="padding:4px 16px 4px 0;">${escape(row.label)}</td><td align="right" style="padding:4px 16px 4px 0;">${escape(formatInteger(row.calls))}</td><td align="right" style="padding:4px 16px 4px 0;">${escape(formatInteger(row.inputTokens))}</td><td align="right" style="padding:4px 16px 4px 0;">${escape(formatInteger(row.outputTokens))}</td><td align="right" style="padding:4px 16px 4px 0;">${escape(formatInteger(row.totalTokens))}</td><td align="right" style="padding:4px 0;">$${escape(formatUsd(row.estimatedCostUsd))}</td></tr>`,
      )
      .join(""),
    "</tbody></table>",
  ].join("");
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatUsd(value: number): string {
  return value.toFixed(value >= 1 ? 2 : 4);
}
