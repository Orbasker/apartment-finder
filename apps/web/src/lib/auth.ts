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
        await new Resend(apiKey).emails.send({
          from,
          to: email,
          subject: "Sign in to Apartment Finder",
          html: `
            <p>Click below to sign in. The link expires in 15 minutes.</p>
            <p><a href="${url}">Sign in to Apartment Finder</a></p>
            <p>If you didn't request this, you can ignore this email.</p>
          `,
        });
      },
    }),
    admin(),
    nextCookies(),
  ],
});

export type Auth = typeof auth;
