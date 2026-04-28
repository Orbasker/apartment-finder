import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, magicLink } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { Resend } from "resend";
import { getDb } from "@/db";
import { account, session, user, verification } from "@/db/schema";
import { env } from "@/lib/env";

const e = env();

const baseURL = e.BETTER_AUTH_URL ?? e.APP_PUBLIC_ORIGIN;

export const auth = betterAuth({
  baseURL,
  secret: e.BETTER_AUTH_SECRET,
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  advanced: {
    database: { generateId: "uuid" },
  },
  socialProviders: {
    google: {
      clientId: e.GOOGLE_CLIENT_ID ?? "",
      clientSecret: e.GOOGLE_CLIENT_SECRET ?? "",
    },
  },
  plugins: [
    magicLink({
      expiresIn: 60 * 15,
      sendMagicLink: async ({ email, url }) => {
        const apiKey = e.RESEND_API_KEY;
        if (!apiKey) throw new Error("RESEND_API_KEY not set");
        const from = e.RESEND_FROM_EMAIL ?? "Apartment Finder <noreply@apartment-finder.app>";
        const safeUrl = url.replace(/"/g, "&quot;");
        await new Resend(apiKey).emails.send({
          from,
          to: email,
          subject: "כניסה ל־Apartment Finder",
          html: `<!doctype html>
<html lang="he" dir="rtl">
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#111827;">
    <p>קישור הכניסה שלך מוכן. הקישור תקף ל־15 דקות.</p>
    <p><a href="${safeUrl}" style="display:inline-block;background:#111827;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">כניסה ל־Apartment Finder</a></p>
    <p style="color:#6b7280;font-size:13px;">אם לא ביקשת קישור כניסה, אפשר להתעלם מהמייל.</p>
  </body>
</html>`,
        });
      },
    }),
    admin(),
    nextCookies(),
  ],
});

export type Auth = typeof auth;
