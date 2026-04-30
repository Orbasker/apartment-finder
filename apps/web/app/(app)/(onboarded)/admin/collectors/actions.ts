"use server";

import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth-server";
import { env } from "@/lib/env";

export async function triggerCollector(source: "yad2" | "facebook") {
  const user = await getCurrentUser();
  if (!isAdmin(user)) redirect("/matches");

  const cronPath = source === "yad2" ? "/api/cron/poll-yad2" : "/api/cron/poll-apify";
  const origin = process.env["BETTER_AUTH_URL"]?.replace(/\/$/, "") ?? "http://localhost:3000";

  const res = await fetch(`${origin}${cronPath}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${env().CRON_SECRET ?? ""}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cron returned ${res.status}: ${text}`);
  }
}
