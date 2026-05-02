import { getCurrentUser } from "@/lib/auth-server";
import { getUnreadAlerts } from "@/matches/store";
import { NotificationPanel } from "./notification-panel";

export async function NotificationBell() {
  const user = await getCurrentUser();
  if (!user) return null;
  const { unreadCount, items } = await getUnreadAlerts(user.id, 50);
  return <NotificationPanel unreadCount={unreadCount} items={serializeItems(items)} />;
}

function serializeItems(items: Awaited<ReturnType<typeof getUnreadAlerts>>["items"]) {
  return items.map((item) => ({
    apartmentId: item.apartmentId,
    sentAt: item.sentAt.toISOString(),
    seenAt: item.seenAt ? item.seenAt.toISOString() : null,
    channels: item.channels,
    neighborhood: item.neighborhood,
    city: item.city,
    formattedAddress: item.formattedAddress,
    priceNis: item.priceNis,
    rooms: item.rooms,
    sqm: item.sqm,
    sourceUrl: item.sourceUrl,
  }));
}
