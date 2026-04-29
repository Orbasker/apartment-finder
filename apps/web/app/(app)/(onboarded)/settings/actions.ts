"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth-server";
import { getDb } from "@/db";
import { userFilters } from "@/db/schema";

export async function restartOnboardingAction() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = getDb();
  await db
    .update(userFilters)
    .set({ onboardedAt: null, updatedAt: new Date() })
    .where(eq(userFilters.userId, user.id));
  redirect("/onboarding");
}
