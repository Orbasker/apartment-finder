import { tool } from "ai";
import { z } from "zod";
import {
  APARTMENT_ATTRIBUTE_KEYS,
  ApartmentAttributeKeySchema,
  AttributeRequirementSchema,
  countActiveFilters,
} from "@apartment-finder/shared";
import {
  addNeighborhoodFilter,
  addText,
  filterExistingNeighborhoodIds,
  loadFilters,
  markOnboarded,
  removeNeighborhoodFilter,
  setAttribute as setAttr,
  upsertFilters,
} from "@/filters/store";
import { searchNeighborhoodsByName } from "@/lib/neighborhoodResolver";
import { activeChannels, loadDestinations, upsertDestinations } from "@/notifications/destinations";
import { mintLinkToken } from "@/notifications/telegram-tokens";
import { env } from "@/lib/env";

const optInt = z.number().int().nullable();
const optNum = z.number().nullable();

export function buildOnboardingTools(userId: string) {
  return {
    setBudget: tool({
      description: "Set the user's monthly rent budget in NIS. Pass null to leave a side open.",
      inputSchema: z.object({
        minNis: optInt.describe("Minimum monthly rent in NIS, or null"),
        maxNis: optInt.describe("Maximum monthly rent in NIS, or null"),
      }),
      execute: async ({ minNis, maxNis }) => {
        await upsertFilters(userId, { priceMinNis: minNis, priceMaxNis: maxNis });
        return { ok: true, priceMinNis: minNis, priceMaxNis: maxNis };
      },
    }),

    setRooms: tool({
      description: "Set the rooms range (e.g. min=2, max=3). Fractional rooms allowed (2.5).",
      inputSchema: z.object({
        min: optNum,
        max: optNum,
      }),
      execute: async ({ min, max }) => {
        await upsertFilters(userId, { roomsMin: min, roomsMax: max });
        return { ok: true, roomsMin: min, roomsMax: max };
      },
    }),

    setSize: tool({
      description: "Set the size range in square meters.",
      inputSchema: z.object({
        minSqm: optInt,
        maxSqm: optInt,
      }),
      execute: async ({ minSqm, maxSqm }) => {
        await upsertFilters(userId, { sqmMin: minSqm, sqmMax: maxSqm });
        return { ok: true, sqmMin: minSqm, sqmMax: maxSqm };
      },
    }),

    searchNeighborhoods: tool({
      description:
        "Search the canonical gov.il neighborhood list (Hebrew). Pass the user's free-text input. Returns up to 5 candidate matches with their canonical id, Hebrew name, and city. ALWAYS call this BEFORE addNeighborhoodFilter so the user picks a canonical match instead of free text. If exactly one obvious candidate comes back, you may proceed; otherwise present them and ask which one.",
      inputSchema: z.object({
        query: z.string().min(1),
        cityNameHe: z
          .string()
          .nullable()
          .describe("Hebrew city name to scope the search, or null for nationwide"),
      }),
      execute: async ({ query, cityNameHe }) => {
        const candidates = await searchNeighborhoodsByName(query, {
          cityNameHe: cityNameHe ?? undefined,
          limit: 5,
        });
        return { ok: true, candidates };
      },
    }),

    addNeighborhoodFilter: tool({
      description:
        "Save a canonical neighborhood (by gov.il id from searchNeighborhoods) as either 'allowed' (user wants alerts there) or 'blocked' (excluded). Only call this with an id returned by searchNeighborhoods.",
      inputSchema: z.object({
        id: z.string().min(1),
        kind: z.enum(["allowed", "blocked"]),
      }),
      execute: async ({ id, kind }) => {
        const valid = await filterExistingNeighborhoodIds([id]);
        if (!valid.has(id)) {
          return {
            ok: false,
            reason: "unknown_neighborhood_id",
            message: "Neighborhood id not found. Call searchNeighborhoods first.",
          };
        }
        await addNeighborhoodFilter(userId, kind, id);
        return { ok: true, id, kind };
      },
    }),

    removeNeighborhoodFilter: tool({
      description: "Remove a previously-saved neighborhood selection.",
      inputSchema: z.object({
        id: z.string().min(1),
        kind: z.enum(["allowed", "blocked"]),
      }),
      execute: async ({ id, kind }) => {
        await removeNeighborhoodFilter(userId, kind, id);
        return { ok: true, id, kind };
      },
    }),

    setAttribute: tool({
      description:
        "Set a boolean attribute requirement. Use required_true / required_false / preferred_true / dont_care.",
      inputSchema: z.object({
        key: ApartmentAttributeKeySchema,
        requirement: AttributeRequirementSchema,
      }),
      execute: async ({ key, requirement }) => {
        await setAttr(userId, key, requirement);
        return { ok: true, key, requirement };
      },
    }),

    addWish: tool({
      description:
        "Add a free-text wish (advisory only, surfaced in alert emails). Hebrew preferred.",
      inputSchema: z.object({ text: z.string().min(1) }),
      execute: async ({ text }) => {
        await addText(userId, "wish", text);
        return { ok: true };
      },
    }),

    addDealbreaker: tool({
      description:
        "Add a free-text dealbreaker (gates email alerts via embedding similarity). Hebrew preferred.",
      inputSchema: z.object({ text: z.string().min(1) }),
      execute: async ({ text }) => {
        await addText(userId, "dealbreaker", text);
        return { ok: true };
      },
    }),

    getCurrentFilters: tool({
      description: "Return the user's current filter set with a count of active filters.",
      inputSchema: z.object({}),
      execute: async () => {
        const f = await loadFilters(userId);
        return {
          filters: f,
          activeCount: countActiveFilters(f),
          attributeKeys: APARTMENT_ATTRIBUTE_KEYS,
        };
      },
    }),

    setNotificationDestinations: tool({
      description:
        "Set the user's notification destinations: email, Telegram, or both. At least one must be true. If telegram is true and the user has not yet linked their account, the result includes `telegramConnectUrl` - render it as a button so the user can link the bot. Once they hit /start, the bot binds the chat ID and returns control to the chat.",
      inputSchema: z.object({
        email: z.boolean(),
        telegram: z.boolean(),
      }),
      execute: async ({ email, telegram }) => {
        if (!email && !telegram) {
          return {
            ok: false,
            reason: "no_channel_selected",
            message: "צריך לבחור לפחות ערוץ אחד - מייל, טלגרם, או שניהם.",
          };
        }
        await upsertDestinations(userId, { emailEnabled: email, telegramEnabled: telegram });
        const destinations = await loadDestinations(userId);
        const telegramAlreadyLinked = Boolean(destinations.telegramChatId);
        const channelsActive = activeChannels(destinations);

        if (telegram && !telegramAlreadyLinked) {
          const botUsername = env().NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
          if (!botUsername) {
            return {
              ok: false,
              reason: "telegram_not_configured",
              message:
                "טלגרם לא מוגדר במערכת כרגע. אפשר להפעיל מייל לבד ולהגדיר טלגרם מאוחר יותר מהדאשבורד.",
            };
          }
          const token = await mintLinkToken(userId);
          const telegramConnectUrl = `https://t.me/${botUsername}?start=${token}`;
          return {
            ok: true,
            email,
            telegram,
            telegramLinked: false,
            telegramConnectUrl,
            channelsActive,
            message:
              "פתחי את הקישור לטלגרם ולחצי 'Start' שם כדי לסיים את החיבור. אפשר לחזור לכאן אחרי זה.",
          };
        }

        return {
          ok: true,
          email,
          telegram,
          telegramLinked: telegramAlreadyLinked,
          channelsActive,
        };
      },
    }),

    completeOnboarding: tool({
      description:
        "Mark onboarding complete and activate alerts. Requires at least 3 active filters AND at least one active notification destination (email or linked Telegram).",
      inputSchema: z.object({}),
      execute: async () => {
        const f = await loadFilters(userId);
        const active = countActiveFilters(f);
        if (active < 3) {
          return {
            ok: false,
            reason: "needs_more_filters",
            activeCount: active,
            message: "צריך לפחות 3 סינונים פעילים כדי להפעיל התראות.",
          };
        }
        const destinations = await loadDestinations(userId);
        const channelsActive = activeChannels(destinations);
        if (channelsActive.length === 0) {
          // Either nothing chosen yet, or telegram was chosen but the link
          // never completed. Tell the model so it can re-prompt.
          if (destinations.telegramEnabled && !destinations.telegramChatId) {
            return {
              ok: false,
              reason: "telegram_not_linked",
              message:
                "עוד לא סיימנו לחבר את הטלגרם. אפשר להשלים את הקישור שם, או לבחור גם מייל בינתיים.",
            };
          }
          return {
            ok: false,
            reason: "needs_destination",
            message: "איפה לשלוח את ההתראות? מייל, טלגרם, או שניהם?",
          };
        }
        await markOnboarded(userId);
        return { ok: true, activeCount: active, channelsActive };
      },
    }),
  };
}
