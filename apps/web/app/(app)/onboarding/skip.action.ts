"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import { markOnboarded } from "@/filters/store";

export async function skipOnboardingAction() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await markOnboarded(user.id);
  redirect("/filters");
}
