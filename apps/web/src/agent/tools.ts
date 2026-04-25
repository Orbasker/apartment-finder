import { tool } from "ai";
import { z } from "zod";
import { PreferencesPatchSchema } from "@apartment-finder/shared";
import { getDb } from "@/db";
import { blockedAuthors } from "@/db/schema";
import { getDashboardStats, getListingById, searchListings } from "@/listings/queries";
import { loadPreferences } from "@/preferences/store";
import { getSubscribedGroupUrls } from "@/groups/subscriptions";
import { rejudgePastListings } from "@/pipeline/judge";
import { stagePatch } from "@/agent/patches";

export function buildAgentTools(userId: string) {
  return {
    searchListings: tool({
      description:
        "Search stored apartment listings. Use to answer questions like 'what did you find in florentin today?' or 'show me 3-room under 7500'.",
      inputSchema: z.object({
        neighborhood: z.string().optional().describe("substring match, e.g. 'florentin'"),
        maxPriceNis: z.number().int().optional(),
        minPriceNis: z.number().int().optional(),
        minScore: z.number().int().min(0).max(100).optional(),
        decision: z.enum(["alert", "skip", "unsure"]).optional(),
        hoursAgo: z.number().int().optional().describe("window in hours; default 168"),
        limit: z.number().int().min(1).max(20).default(10),
      }),
      execute: async (args) => {
        const subscribedGroupUrls = await getSubscribedGroupUrls(userId);
        const { rows } = await searchListings({
          neighborhood: args.neighborhood,
          maxPriceNis: args.maxPriceNis,
          minPriceNis: args.minPriceNis,
          minScore: args.minScore,
          decision: args.decision,
          hoursAgo: args.hoursAgo ?? 168,
          limit: args.limit,
          forUserId: userId,
          subscribedGroupUrls,
        });
        return rows.map((r) => ({
          id: r.id,
          url: r.url,
          neighborhood: r.neighborhood,
          priceNis: r.priceNis,
          rooms: r.rooms,
          sqm: r.sqm,
          score: r.score,
          decision: r.decision,
          summary: r.reasoning?.slice(0, 160) ?? null,
        }));
      },
    }),

    getListing: tool({
      description: "Fetch a single listing by its numeric id.",
      inputSchema: z.object({ id: z.number().int() }),
      execute: async ({ id }) => {
        const row = await getListingById(id, userId);
        if (!row) return { error: "not found" };
        return row;
      },
    }),

    getStats: tool({
      description: "Dashboard stats for the last N hours.",
      inputSchema: z.object({
        hoursAgo: z.number().int().min(1).max(168).default(24),
      }),
      execute: async ({ hoursAgo }) => getDashboardStats(hoursAgo),
    }),

    getPreferences: tool({
      description: "Return the current stored user preferences.",
      inputSchema: z.object({}),
      execute: async () => loadPreferences(userId),
    }),

    proposePreferencesPatch: tool({
      description:
        "Stage a partial update to preferences. Does NOT apply until the user replies /confirm. Use this whenever the user wants to change budget, rooms, neighborhoods, deal-breakers, or alert settings such as the target email list, run-summary emails, or top-picks emails.",
      inputSchema: z.object({
        patch: PreferencesPatchSchema,
        humanSummary: z
          .string()
          .describe("Short summary of what the patch changes, shown to the user."),
      }),
      execute: async ({ patch, humanSummary }, { toolCallId }) => {
        await stagePatch({ userId, toolCallId, patch });
        return {
          staged: true,
          summary: humanSummary,
          hint: "Reply /confirm to apply, /cancel to discard.",
        };
      },
    }),

    rejudgeRecent: tool({
      description:
        "Re-run the AI judge over recent listings using the current user's preferences. Use after preferences change if the user wants fresh scores.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(500).default(100),
      }),
      execute: async ({ limit }) => {
        const count = await rejudgePastListings(limit, userId);
        return { rejudged: count };
      },
    }),

    blockAuthor: tool({
      description: "Block a Facebook author/profile so future posts from them are filtered out.",
      inputSchema: z.object({
        profileUrl: z.string().url(),
        reason: z.string().optional(),
      }),
      execute: async ({ profileUrl, reason }) => {
        const db = getDb();
        await db
          .insert(blockedAuthors)
          .values({ profileUrl, reason: reason ?? null })
          .onConflictDoNothing();
        return { blocked: true, profileUrl };
      },
    }),

    recentIngested: tool({
      description: "Quick list of the most recently ingested listings regardless of score.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(20).default(5) }),
      execute: async ({ limit }) => {
        const { rows } = await searchListings({ limit });
        return rows.map((row) => ({
          id: row.id,
          url: row.url,
          neighborhood: row.neighborhood,
          priceNis: row.priceNis,
          rooms: row.rooms,
        }));
      },
    }),
  };
}
