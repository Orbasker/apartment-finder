"use server";

import { revalidatePath } from "next/cache";
import { PreferencesSchema, type Preferences } from "@apartment-finder/shared";
import { savePreferences } from "@/preferences/store";

export async function savePreferencesAction(input: Preferences) {
  const parsed = PreferencesSchema.parse(input);
  await savePreferences(parsed);
  revalidatePath("/dashboard");
}
