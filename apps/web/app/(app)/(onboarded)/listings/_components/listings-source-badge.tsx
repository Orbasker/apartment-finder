import { getTranslations } from "next-intl/server";
import type { ListingSource } from "@/listings/types";

export async function ListingsSourceBadge({ source }: { source: ListingSource | null }) {
  if (!source) return <>—</>;
  const t = await getTranslations("Listings.source");
  // Literal keys only — i18n:check rejects dynamic args.
  const label = source === "yad2" ? t("yad2") : t("facebook");
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">
      {label}
    </span>
  );
}
