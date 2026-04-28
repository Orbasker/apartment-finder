import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import { countActive, loadFilters } from "@/filters/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const filters = await loadFilters(user.id);
  if (!filters.onboardedAt) redirect("/onboarding");

  const active = countActive(filters);
  const status = filters.isActive ? "פעיל" : "מושהה";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">הכל מוגדר. נחפש דירות.</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ההתראות יישלחו לדוא״ל ברגע שתופיע דירה תואמת.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">סטטוס</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="התראות" value={status} />
          <Row label="סינונים פעילים" value={<bdi>{active}</bdi>} />
          <Row label="מקסימום ביום" value={<bdi>{filters.dailyAlertCap}</bdi>} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/filters" className="block">
          <Button variant="outline" className="h-12 w-full text-base">
            עריכת סינונים
          </Button>
        </Link>
        <Link href="/onboarding" className="block">
          <Button variant="outline" className="h-12 w-full text-base">
            צ׳אט אונבורדינג
          </Button>
        </Link>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
