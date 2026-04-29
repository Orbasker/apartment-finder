import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, emailOTP } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { render } from "@react-email/render";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { Resend } from "resend";
import { getDb } from "@/db";
import { account, session, user, verification } from "@/db/schema";
import { SignInCodeEmail } from "@/emails/SignInCode";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "@/i18n/locales";
import { env } from "@/lib/env";

const OTP_EXPIRES_MINUTES = 5;

const e = env();

const baseURL = e.BETTER_AUTH_URL ?? e.APP_PUBLIC_ORIGIN;

export function isGoogleConfigured(): boolean {
  return Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET);
}

const socialProviders = isGoogleConfigured()
  ? {
      google: {
        clientId: e.GOOGLE_CLIENT_ID as string,
        clientSecret: e.GOOGLE_CLIENT_SECRET as string,
      },
    }
  : undefined;

// Better Auth rejects requests whose Origin header isn't in this list (besides
// baseURL). In dev, allow http://localhost:3000 unconditionally so a stale
// BETTER_AUTH_URL pointing at Vercel doesn't break local sign-in.
const trustedOrigins: string[] = [];
if (e.NODE_ENV !== "production") {
  trustedOrigins.push("http://localhost:3000");
}

function readLocaleFromHeaders(headers: Headers | undefined): Locale {
  if (!headers) return DEFAULT_LOCALE;
  const cookieHeader = headers.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const [k, v] = part.trim().split("=");
    if (k === LOCALE_COOKIE && isLocale(v)) return v;
  }
  const accept = headers.get("accept-language") ?? "";
  const primary = accept.split(",")[0]?.split(";")[0]?.trim().toLowerCase().split("-")[0];
  if (isLocale(primary)) return primary;
  return DEFAULT_LOCALE;
}

export const auth = betterAuth({
  baseURL,
  secret: e.BETTER_AUTH_SECRET,
  ...(trustedOrigins.length > 0 ? { trustedOrigins } : {}),
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  advanced: {
    database: { generateId: "uuid" },
  },
  account: {
    accountLinking: {
      enabled: true,
      // Google verifies the user's email before issuing OAuth tokens, so we
      // can safely link a new Google account to an existing OTP-only user
      // with the same email instead of creating a duplicate user row.
      trustedProviders: ["google"],
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (createdUser) => {
          const adminEmail = e.ADMIN_EMAIL?.trim().toLowerCase();
          if (!adminEmail) return;
          if (createdUser.email.trim().toLowerCase() !== adminEmail) return;
          await getDb().update(user).set({ role: "admin" }).where(eq(user.id, createdUser.id));
        },
      },
    },
  },
  ...(socialProviders ? { socialProviders } : {}),
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 60 * OTP_EXPIRES_MINUTES,
      sendVerificationOTP: async ({ email, otp, type }, ctx) => {
        const apiKey = e.RESEND_API_KEY;
        if (!apiKey) throw new Error("RESEND_API_KEY not set");
        const from = e.RESEND_FROM_EMAIL;
        if (!from) throw new Error("RESEND_FROM_EMAIL not set");

        const locale = readLocaleFromHeaders(ctx?.request?.headers);
        const t = await getTranslations({ locale });
        const subject = t("Email.SignInCode.subject", { otp });
        const strings = {
          preview: t("Email.SignInCode.preview", { otp }),
          heading: t("Email.SignInCode.heading"),
          instruction: t("Email.SignInCode.instruction"),
          expiry: t("Email.SignInCode.expiry", { minutes: OTP_EXPIRES_MINUTES }),
        };

        const html = await render(SignInCodeEmail({ otp, locale, strings }));
        const text = await render(SignInCodeEmail({ otp, locale, strings }), {
          plainText: true,
        });
        const result = await new Resend(apiKey).emails.send({
          from,
          to: email,
          subject,
          html,
          text,
        });
        if (result.error) {
          console.error("[email-otp] Resend rejected send", {
            from,
            to: email,
            type,
            error: result.error,
          });
          throw new Error(`Resend send failed: ${result.error.message ?? "unknown"}`);
        }
        console.log("[email-otp] sent", {
          to: email,
          type,
          locale,
          messageId: result.data?.id,
        });
      },
    }),
    admin(),
    nextCookies(),
  ],
});

export type Auth = typeof auth;
