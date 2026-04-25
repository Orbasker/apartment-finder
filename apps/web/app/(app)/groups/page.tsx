import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { monitoredGroups } from "@/db/schema";
import { getRequestUser, isAdmin } from "@/lib/supabase/server";
import { getSubscribedGroupUrls } from "@/groups/subscriptions";
import { GroupsForm } from "./form";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const user = await getRequestUser();
  if (!user) notFound();

  const db = getDb();
  const [rows, subscribed] = await Promise.all([
    db.select().from(monitoredGroups).orderBy(monitoredGroups.addedAt),
    getSubscribedGroupUrls(user.id),
  ]);
  const subscribedSet = new Set(subscribed);

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-2 text-xl font-semibold">Facebook groups</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Public Facebook groups monitored via Apify. Anyone can add a group. Check the boxes for
        groups you want alerts from.
        {isAdmin(user) && " As admin, you can also enable/disable catalog groups and delete them."}
      </p>
      <GroupsForm
        isAdmin={isAdmin(user)}
        initial={rows.map((r) => ({
          url: r.url,
          label: r.label,
          enabled: r.enabled,
          subscribed: subscribedSet.has(r.url),
        }))}
      />
    </div>
  );
}
