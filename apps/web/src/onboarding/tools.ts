import { tool } from "ai";
import { z } from "zod";
import {
  APARTMENT_ATTRIBUTE_KEYS,
  ApartmentAttributeKeySchema,
  AttributeRequirementSchema,
  countActiveFilters,
} from "@apartment-finder/shared";
import {
  addCity,
  addText,
  loadFilters,
  markOnboarded,
  removeNeighborhoodFilter,
  setAttribute as setAttr,
  setRadiusFilter,
  upsertFilters,
} from "@/filters/store";
import {
  autocompleteCities,
  autocompleteNeighborhoods,
  listNeighborhoodsInCity,
  searchRadiusPoints,
} from "@/lib/googlePlaces";
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

    searchRadiusPoints: tool({
      description:
        "Resolve a user-typed address, landmark, street, or intersection to location candidates for a radius filter. Use this before setRadiusSearch. Do not mention coordinates or place IDs to the user.",
      inputSchema: z.object({
        query: z.string().min(1).describe("User's typed point in Hebrew."),
      }),
      execute: async ({ query }) => {
        const candidates = await searchRadiusPoints(query);
        return { ok: true, candidates };
      },
    }),

    setRadiusSearch: tool({
      description:
        "Save a radius search around a point returned by searchRadiusPoints. radiusKm is the maximum distance from the point in kilometers.",
      inputSchema: z.object({
        placeId: z.string().min(1),
        nameHe: z.string().min(1),
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
        radiusKm: z.number().positive(),
      }),
      execute: async ({ placeId, nameHe, lat, lon, radiusKm }) => {
        await setRadiusFilter(userId, {
          centerLat: lat,
          centerLon: lon,
          radiusKm,
          label: nameHe,
        });
        return { ok: true, placeId, nameHe, radiusKm };
      },
    }),

    clearRadiusSearch: tool({
      description: "Remove the user's radius search filter.",
      inputSchema: z.object({}),
      execute: async () => {
        await setRadiusFilter(userId, null);
        return { ok: true };
      },
    }),

    searchCity: tool({
      description:
        "Resolve a user-typed city name to Google Places candidates. Returns up to a few options; the model should pick the best match (or ask the user to disambiguate when ambiguous), then call `selectCity` with the chosen placeId+nameHe. The UI does NOT render chips for this tool. ALWAYS resolve a city this way BEFORE searchNeighborhoods, which needs an authoritative cityPlaceId.",
      inputSchema: z.object({
        query: z.string().min(1).describe("User's typed city name in Hebrew, e.g. 'תל אביב'."),
      }),
      execute: async ({ query }) => {
        const candidates = await autocompleteCities(query);
        return { ok: true, candidates };
      },
    }),

    selectCity: tool({
      description:
        "Save the chosen city to the user's filter set. Pass the exact placeId+nameHe from a prior searchCity result — never invent place_ids. Call this immediately after picking the best candidate (or after user disambiguation). After it succeeds, move on to searchNeighborhoods using the same cityPlaceId+cityNameHe.",
      inputSchema: z.object({
        placeId: z.string().min(1).describe("Google place_id from searchCity."),
        nameHe: z.string().min(1).describe("Hebrew city name from searchCity."),
      }),
      execute: async ({ placeId, nameHe }) => {
        await addCity(userId, { placeId, nameHe });
        return { ok: true, placeId, nameHe };
      },
    }),

    searchNeighborhoods: tool({
      description:
        "Find neighborhoods inside a specific city via Google Places. The chat UI renders the result as clickable chips — clicking a chip saves the neighborhood (and its parent city) for the current user, so DO NOT call any save tool for chips. Pass an empty `query` plus `cityNameHe` + `cityPlaceId` to browse the city's neighborhoods; pass a non-empty `query` for typeahead. Always specify `kind`. Both `cityPlaceId` and `cityNameHe` MUST come from a prior searchCity result for the same city.",
      inputSchema: z.object({
        query: z
          .string()
          .describe("User's typed neighborhood name in Hebrew, or empty string to browse."),
        cityPlaceId: z
          .string()
          .min(1)
          .describe("Google place_id of the parent city (from a prior searchCity result)."),
        cityNameHe: z.string().min(1).describe("Hebrew city name of the parent city."),
        kind: z
          .enum(["allowed", "blocked"])
          .describe("Whether a chip click adds the choice to the allowed or blocked list."),
      }),
      execute: async ({ query, cityPlaceId, cityNameHe, kind }) => {
        const trimmed = query.trim();
        const raw =
          trimmed === ""
            ? await listNeighborhoodsInCity(cityNameHe)
            : await autocompleteNeighborhoods(trimmed, cityNameHe);
        // Stamp the parent cityPlaceId/cityNameHe onto every candidate so the
        // chip click has the FK link without a second lookup.
        const candidates = raw.map((c) => ({
          placeId: c.placeId,
          nameHe: c.nameHe,
          cityPlaceId,
          cityNameHe,
        }));
        return { ok: true, kind, candidates };
      },
    }),

    removeNeighborhoodFilter: tool({
      description:
        "Remove a previously-saved neighborhood selection by its Google place_id and kind.",
      inputSchema: z.object({
        placeId: z.string().min(1),
        kind: z.enum(["allowed", "blocked"]),
      }),
      execute: async ({ placeId, kind }) => {
        await removeNeighborhoodFilter(userId, kind, placeId);
        return { ok: true, placeId, kind };
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

    setNotifyOnUnknownMustHave: tool({
      description:
        "Set whether to notify the user when a listing's must-have criteria cannot be verified. true = send notification (user decides), false = skip listing.",
      inputSchema: z.object({
        notify: z.boolean().describe("true to notify when must-haves are unknown, false to skip"),
      }),
      execute: async ({ notify }) => {
        await upsertFilters(userId, { notifyOnUnknownMustHave: notify });
        return { ok: true, notifyOnUnknownMustHave: notify };
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

    setNotifyOnUnknown: tool({
      description:
        "Save the user's global preference for must-have requirements that the listing doesn't confirm or refute. Pass `notify=true` (default, recommended) to receive the alert anyway with the unverified field tagged; `notify=false` to skip the listing until every must-have is confirmed. Ask once during onboarding, after collecting the must-have attributes.",
      inputSchema: z.object({
        notify: z.boolean(),
      }),
      execute: async ({ notify }) => {
        await upsertFilters(userId, { strictUnknowns: !notify });
        return { ok: true, notify };
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
