import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, emailOTP } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { render } from "@react-email/render";
import { Resend } from "resend";
import { getDb } from "@/db";
import { account, session, user, verification } from "@/db/schema";
import { SignInCodeEmail } from "@/emails/SignInCode";
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
  ...(socialProviders ? { socialProviders } : {}),
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 60 * OTP_EXPIRES_MINUTES,
      sendVerificationOTP: async ({ email, otp, type }) => {
        const apiKey = e.RESEND_API_KEY;
        if (!apiKey) throw new Error("RESEND_API_KEY not set");
        const from = e.RESEND_FROM_EMAIL;
        if (!from) throw new Error("RESEND_FROM_EMAIL not set");
        const html = await render(SignInCodeEmail({ otp, expiresInMinutes: OTP_EXPIRES_MINUTES }));
        const text = await render(SignInCodeEmail({ otp, expiresInMinutes: OTP_EXPIRES_MINUTES }), {
          plainText: true,
        });
        const result = await new Resend(apiKey).emails.send({
          from,
          to: email,
          subject: `קוד הכניסה שלך: ${otp}`,
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
        console.log("[email-otp] sent", { to: email, type, messageId: result.data?.id });
      },
    }),
    admin(),
    nextCookies(),
  ],
});

export type Auth = typeof auth;
