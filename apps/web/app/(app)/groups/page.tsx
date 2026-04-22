import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { monitoredGroups } from "@/db/schema";
import { GroupsForm } from "./form";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const db = getDb();
  const rows = await db.select().from(monitoredGroups).orderBy(monitoredGroups.addedAt);
  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-2 text-xl font-semibold">Facebook groups</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Public Facebook groups to monitor via Apify. Paste the URL (e.g.{" "}
        <code>https://www.facebook.com/groups/1234567890</code>).
      </p>
      <GroupsForm
        initial={rows.map((r) => ({ url: r.url, label: r.label, enabled: r.enabled }))}
      />
    </div>
  );
}

export { eq };
