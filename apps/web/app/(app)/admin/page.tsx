import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser, isAdmin } from "@/lib/supabase/server";
import { getAiUsageSummary } from "@/lib/aiUsage";
import { getCostProjection } from "@/lib/costProjection";
import { getDashboardStats } from "@/listings/queries";
import { getSourceHealth } from "@/admin/queries";
import { relTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) notFound();

  const [ai24h, ai7d, ai30d, day, week, sources, projection] = await Promise.all([
    getAiUsageSummary(24),
    getAiUsageSummary(24 * 7),
    getAiUsageSummary(24 * 30),
    getDashboardStats(24),
    getDashboardStats(24 * 7),
    getSourceHealth(),
    getCostProjection(),
  ]);

  return (
    <div className="space-y-8">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Admin</h2>
          <p className="text-sm text-muted-foreground">
            Signed in as {user?.email} · admin
          </p>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard
          title="Projected monthly"
          value={usd(projection.totalMonthlyUsd)}
          subtitle={`AI ${usd(projection.aiMonthlyProjectedUsd)} + fixed ${usd(projection.fixedMonthlyUsd)}`}
        />
        <MetricCard title="AI spend · 24h" value={usd(ai24h.estimatedCostUsd)} subtitle={`${ai24h.totalCalls} calls`} />
        <MetricCard title="AI spend · 7d" value={usd(ai7d.estimatedCostUsd)} subtitle={`${ai7d.totalCalls} calls`} />
        <MetricCard title="AI spend · 30d" value={usd(ai30d.estimatedCostUsd)} subtitle={`${ai30d.totalCalls} calls`} />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>AI spend by feature · 7d</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownTable rows={ai7d.byFeature} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>AI spend by model · 7d</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownTable rows={ai7d.byModel} />
          </CardContent>
        </Card>
      </section>

      <section>
        <h3 className="mb-3 text-lg font-semibold">Scraper health</h3>
        <Card>
          <CardContent className="p-0">
            <table className="min-w-full text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="p-2">Source</th>
                  <th className="p-2">Last ingest</th>
                  <th className="p-2 text-right">24h</th>
                  <th className="p-2 text-right">7d</th>
                </tr>
              </thead>
              <tbody>
                {sources.length === 0 ? (
                  <tr>
                    <td className="p-3 text-muted-foreground" colSpan={4}>
                      No listings ingested yet.
                    </td>
                  </tr>
                ) : (
                  sources.map((s) => (
                    <tr key={s.source} className="border-t">
                      <td className="p-2">
                        <Badge variant="muted">{s.source}</Badge>
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {s.lastIngestedAt ? relTime(new Date(s.lastIngestedAt)) : "—"}
                      </td>
                      <td className="p-2 text-right font-medium">{s.count24h}</td>
                      <td className="p-2 text-right font-medium">{s.count7d}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pipeline · 24h</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Ingested" value={day.total} />
            <Row label="Alerted" value={day.alerted} />
            <Row label="Unsure" value={day.unsure} />
            <Row label="Skipped" value={day.skipped} />
            <Row label="Alerts sent" value={day.alertsSent} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pipeline · 7d</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Ingested" value={week.total} />
            <Row label="Alerted" value={week.alerted} />
            <Row label="Unsure" value={week.unsure} />
            <Row label="Skipped" value={week.skipped} />
            <Row label="Alerts sent" value={week.alertsSent} />
          </CardContent>
        </Card>
      </section>

      <section>
        <h3 className="mb-3 text-lg font-semibold">Fixed monthly costs</h3>
        <Card>
          <CardContent className="p-0">
            <table className="min-w-full text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="p-2">Service</th>
                  <th className="p-2">Note</th>
                  <th className="p-2 text-right">Monthly</th>
                </tr>
              </thead>
              <tbody>
                {projection.fixed.map((f) => (
                  <tr key={f.label} className="border-t">
                    <td className="p-2">{f.label}</td>
                    <td className="p-2 text-muted-foreground">{f.note ?? ""}</td>
                    <td className="p-2 text-right font-medium">{usd(f.monthlyUsd)}</td>
                  </tr>
                ))}
                <tr className="border-t bg-muted/40">
                  <td className="p-2 font-semibold" colSpan={2}>
                    Total fixed
                  </td>
                  <td className="p-2 text-right font-semibold">
                    {usd(projection.fixedMonthlyUsd)}
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
        <p className="mt-2 text-xs text-muted-foreground">
          Fixed costs are configured in <code>apps/web/src/lib/costProjection.ts</code>. AI monthly
          projection extrapolates the last 7 days of <code>ai_usage</code> to 30 days (falls back to
          the trailing 30-day window if 7d is empty).
        </p>
      </section>
    </div>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        {subtitle && <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>}
      </CardContent>
    </Card>
  );
}

function BreakdownTable({
  rows,
}: {
  rows: ReadonlyArray<{
    label: string;
    calls: number;
    totalTokens: number;
    estimatedCostUsd: number;
  }>;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No usage in this window.</p>;
  }
  return (
    <table className="min-w-full text-sm">
      <thead className="text-left text-muted-foreground">
        <tr>
          <th className="py-1">Label</th>
          <th className="py-1 text-right">Calls</th>
          <th className="py-1 text-right">Tokens</th>
          <th className="py-1 text-right">Cost</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-t">
            <td className="py-1 pr-2 font-mono text-xs">{r.label}</td>
            <td className="py-1 text-right">{r.calls}</td>
            <td className="py-1 text-right">{r.totalTokens.toLocaleString()}</td>
            <td className="py-1 text-right font-medium">{usd(r.estimatedCostUsd)}</td>
          </tr>
        ))}
      </tbody>
    </table>
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

function usd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n < 1 ? 4 : 2,
  });
}
