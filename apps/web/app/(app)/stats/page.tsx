import { getDashboardStats } from "@/listings/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const [day, week] = await Promise.all([
    getDashboardStats(24),
    getDashboardStats(24 * 7),
  ]);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Stats</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <StatsCard title="Last 24h" stats={day} />
        <StatsCard title="Last 7 days" stats={week} />
      </div>
    </div>
  );
}

function StatsCard({
  title,
  stats,
}: {
  title: string;
  stats: Awaited<ReturnType<typeof getDashboardStats>>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <Row label="Ingested" value={stats.total} />
        <Row label="Alerted" value={stats.alerted} />
        <Row label="Skipped" value={stats.skipped} />
        <Row label="Unsure" value={stats.unsure} />
        <Row label="Alerts sent" value={stats.alertsSent} />
        <hr className="my-2" />
        <Row label="Yad2" value={stats.bySource.yad2} />
        <Row label="FB (Apify)" value={stats.bySource.fb_apify} />
        <Row label="FB (ext.)" value={stats.bySource.fb_ext} />
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
