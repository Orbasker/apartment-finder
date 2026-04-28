import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import { loadFilters } from "@/filters/store";
import { FiltersForm } from "./form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "סינונים — Apartment Finder",
};

export default async function FiltersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const filters = await loadFilters(user.id);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <header className="mb-4 sm:mb-6">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">סינונים</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          עריכת הסינונים שלך. שמירה תפעיל את ההתראות.
        </p>
      </header>
      <FiltersForm filters={filters} />
    </div>
  );
}
