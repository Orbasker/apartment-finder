"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ListingsError({ message }: { message?: string }) {
  const t = useTranslations("Listings.error");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-destructive">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{message ?? t("body")}</CardContent>
    </Card>
  );
}
