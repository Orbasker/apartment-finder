import { tool } from "ai";
import { z } from "zod";
import {
  APARTMENT_ATTRIBUTE_KEYS,
  ApartmentAttributeKeySchema,
  AttributeRequirementSchema,
  countActiveFilters,
} from "@apartment-finder/shared";
import {
  addText,
  loadFilters,
  markOnboarded,
  setAttribute as setAttr,
  upsertFilters,
} from "@/filters/store";

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

    addAllowedNeighborhood: tool({
      description:
        "Add a Tel Aviv neighborhood the user wants alerts for (Hebrew, exact spelling).",
      inputSchema: z.object({ name: z.string().min(1) }),
      execute: async ({ name }) => {
        const f = await loadFilters(userId);
        const next = Array.from(new Set([...f.allowedNeighborhoods, name.trim()]));
        await upsertFilters(userId, { allowedNeighborhoods: next });
        return { ok: true, allowedNeighborhoods: next };
      },
    }),

    addBlockedNeighborhood: tool({
      description: "Add a neighborhood the user wants to exclude (e.g. far from work).",
      inputSchema: z.object({ name: z.string().min(1) }),
      execute: async ({ name }) => {
        const f = await loadFilters(userId);
        const next = Array.from(new Set([...f.blockedNeighborhoods, name.trim()]));
        await upsertFilters(userId, { blockedNeighborhoods: next });
        return { ok: true, blockedNeighborhoods: next };
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

    completeOnboarding: tool({
      description:
        "Mark onboarding complete and activate alerts. Requires at least 3 active filters.",
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
        await markOnboarded(userId);
        return { ok: true, activeCount: active };
      },
    }),
  };
}
