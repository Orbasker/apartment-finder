import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser, isAdmin } from "@/lib/auth-server";
import { getAiUsageSummary } from "@/lib/aiUsage";
import { buildCostProjection } from "@/lib/costProjection";
import { getDashboardStats } from "@/listings/queries";
import { getSourceHealth } from "@/admin/queries";
import { cn, relTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "stats", label: "Stats" },
  { id: "costs", label: "Costs" },
  { id: "sources", label: "Sources" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function hrefForTab(id: TabId): string {
  return id === "stats" ? "/admin" : `/admin?tab=${id}`;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) notFound();

  const { tab: tabParam } = await searchParams;
  const active: TabId = TABS.find((t) => t.id === tabParam)?.id ?? "stats";

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold sm:text-2xl">Admin</h2>
        <p className="text-sm text-muted-foreground break-words">
          Signed in as {user?.email} · admin
        </p>
      </header>

      <nav className="-mx-4 flex gap-1 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0">
        {TABS.map((t) => {
          const isActive = t.id === active;
          return (
            <Link
              key={t.id}
              href={hrefForTab(t.id)}
              prefetch
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
                isActive
                  ? "border-foreground font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {active === "stats" && <StatsTab />}
      {active === "costs" && <CostsTab />}
      {active === "sources" && <SourcesTab />}
    </div>
  );
}

async function StatsTab() {
  const [day, week] = await Promise.all([getDashboardStats(24), getDashboardStats(24 * 7)]);
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <StatsCard title="Last 24h" stats={day} />
      <StatsCard title="Last 7 days" stats={week} />
    </section>
  );
}

async function CostsTab() {
  const [ai24h, ai7d, ai30d] = await Promise.all([
    getAiUsageSummary(24),
    getAiUsageSummary(24 * 7),
    getAiUsageSummary(24 * 30),
  ]);
  const projection = buildCostProjection(ai7d, ai30d);

  return (
    <div className="space-y-6 sm:space-y-8">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Projected monthly"
          value={usd(projection.totalMonthlyUsd)}
          subtitle={`AI ${usd(projection.aiMonthlyProjectedUsd)} + fixed ${usd(projection.fixedMonthlyUsd)}`}
        />
        <MetricCard
          title="AI spend · 24h"
          value={usd(ai24h.estimatedCostUsd)}
          subtitle={`${ai24h.totalCalls} calls`}
        />
        <MetricCard
          title="AI spend · 7d"
          value={usd(ai7d.estimatedCostUsd)}
          subtitle={`${ai7d.totalCalls} calls`}
        />
        <MetricCard
          title="AI spend · 30d"
          value={usd(ai30d.estimatedCostUsd)}
          subtitle={`${ai30d.totalCalls} calls`}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
        <h3 className="mb-3 text-lg font-semibold">Fixed monthly costs</h3>
        <Card>
          <CardContent className="overflow-x-auto p-0">
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

async function SourcesTab() {
  const sources = await getSourceHealth();
  return (
    <section>
      <Card>
        <CardContent className="overflow-x-auto p-0">
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
    <div className="overflow-x-auto">
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
    </div>
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
