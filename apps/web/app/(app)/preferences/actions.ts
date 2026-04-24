"use server";

import { revalidatePath } from "next/cache";
import { PreferencesSchema, type Preferences } from "@apartment-finder/shared";
import { getRequestUser } from "@/lib/supabase/server";
import { savePreferences } from "@/preferences/store";

export async function savePreferencesAction(input: Preferences) {
  const user = await getRequestUser();
  if (!user) throw new Error("Not authenticated");
  const parsed = PreferencesSchema.parse(input);
  await savePreferences(user.id, parsed);
  revalidatePath("/preferences");
}
