"use server";

import { revalidatePath } from "next/cache";
import {
  APARTMENT_ATTRIBUTE_KEYS,
  type ApartmentAttributeKey,
  AttributeRequirementSchema,
  type AttributeRequirement,
} from "@apartment-finder/shared";
import { getCurrentUser } from "@/lib/auth-server";
import { markOnboarded, replaceAttributes, replaceTexts, upsertFilters } from "@/filters/store";

function parseOptionalInt(v: FormDataEntryValue | null): number | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function parseOptionalNum(v: FormDataEntryValue | null): number | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function parseList(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function saveFiltersAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  await upsertFilters(user.id, {
    priceMinNis: parseOptionalInt(formData.get("priceMinNis")),
    priceMaxNis: parseOptionalInt(formData.get("priceMaxNis")),
    roomsMin: parseOptionalNum(formData.get("roomsMin")),
    roomsMax: parseOptionalNum(formData.get("roomsMax")),
    sqmMin: parseOptionalInt(formData.get("sqmMin")),
    sqmMax: parseOptionalInt(formData.get("sqmMax")),
    allowedNeighborhoods: parseList(formData.get("allowedNeighborhoods")),
    blockedNeighborhoods: parseList(formData.get("blockedNeighborhoods")),
    strictUnknowns: formData.get("strictUnknowns") === "on",
    isActive: formData.get("isActive") === "on",
    dailyAlertCap: parseOptionalInt(formData.get("dailyAlertCap")) ?? 20,
    maxAgeHours: parseOptionalInt(formData.get("maxAgeHours")) ?? 48,
  });

  const attrs: Array<{ key: ApartmentAttributeKey; requirement: AttributeRequirement }> = [];
  for (const key of APARTMENT_ATTRIBUTE_KEYS) {
    const raw = formData.get(`attr-${key}`);
    if (typeof raw !== "string") continue;
    const parsed = AttributeRequirementSchema.safeParse(raw);
    if (!parsed.success) continue;
    attrs.push({ key, requirement: parsed.data });
  }
  await replaceAttributes(user.id, attrs);

  await replaceTexts(user.id, "wish", parseList(formData.get("wishes")));
  await replaceTexts(user.id, "dealbreaker", parseList(formData.get("dealbreakers")));

  // First save = onboarding complete (so /filters can be used as the onboarding alternative).
  await markOnboarded(user.id);

  revalidatePath("/filters");
  revalidatePath("/");
}
