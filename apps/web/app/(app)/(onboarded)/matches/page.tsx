import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "דירות - Apartment Finder",
};

export default function MatchesPage() {
  return (
    <main className="flex w-full flex-col gap-4 sm:gap-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">דירות</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          כאן תופיע רשימת הדירות שמצאנו עבורך, לפי הסינונים שלך.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">בקרוב</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          דירות שיתאימו ייכנסו לכאן ויוצגו ב־Inbox מסודר. בינתיים, ההתראות נשלחות לפי היעדים שהגדרת.
        </CardContent>
      </Card>
    </main>
  );
}
