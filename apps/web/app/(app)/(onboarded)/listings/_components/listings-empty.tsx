"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ListingsEmpty({ hasActiveFilters }: { hasActiveFilters: boolean }) {
  const t = useTranslations("Listings.empty");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {hasActiveFilters ? t("filteredTitle") : t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {hasActiveFilters ? t("filteredBody") : t("body")}
      </CardContent>
    </Card>
  );
}
