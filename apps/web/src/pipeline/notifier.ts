import { sendTelegramAlert } from "@/integrations/telegram";
import { sendEmailAlert, isResendConfigured } from "@/integrations/resend";
import {
  hasAlertBeenSent,
  recordAlertSent,
  type AlertChannel,
  type AlertEntry,
} from "@/pipeline/sentAlerts";

export type { AlertChannel, AlertEntry } from "@/pipeline/sentAlerts";

export type NotifyOptions = AlertEntry & {
  channels?: AlertChannel[];
};

export async function notifyListing(opts: NotifyOptions): Promise<void> {
  const channels = opts.channels ?? ["telegram", "email"];
  const tasks: Promise<unknown>[] = [];
  if (channels.includes("telegram")) {
    tasks.push(notifyChannel("telegram", opts.listingId, () => sendTelegramAlert(opts)));
  }
  if (channels.includes("email") && isResendConfigured()) {
    tasks.push(notifyChannel("email", opts.listingId, () => sendEmailAlert(opts)));
  }
  await Promise.all(tasks);
}

async function notifyChannel(
  channel: AlertChannel,
  listingId: number,
  send: () => Promise<void>,
): Promise<void> {
  if (await hasAlertBeenSent(listingId, channel)) return;

  try {
    await send();
  } catch (err) {
    console.error(`send ${channel} alert failed:`, err);
    return;
  }

  await recordAlertSent(listingId, channel);
}
