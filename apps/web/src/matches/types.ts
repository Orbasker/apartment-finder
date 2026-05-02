import type { ApartmentAttributeKey, FurnitureStatus } from "@apartment-finder/shared";

export type UserApartmentStatusKind = "new" | "interested" | "contacted" | "visited" | "rejected";

export const USER_APARTMENT_STATUS_KINDS: readonly UserApartmentStatusKind[] = [
  "new",
  "interested",
  "contacted",
  "visited",
  "rejected",
] as const;

export type NotifyChannel = "email" | "telegram";

/**
 * One match the user has been alerted about. Mirrors `MatchAlertProps` plus
 * fields the UI needs (id, lat/lon, sentAt/seenAt, status, note).
 */
export type MatchFeedItem = {
  apartmentId: number;
  sentAt: Date;
  seenAt: Date | null;
  // Apartment
  lat: number | null;
  lon: number | null;
  neighborhood: string | null;
  city: string | null;
  formattedAddress: string | null;
  rooms: number | null;
  sqm: number | null;
  floor: number | null;
  priceNis: number | null;
  primaryListingId: number | null;
  // Extraction (latest version)
  condition: string | null;
  arnonaNis: number | null;
  vaadBayitNis: number | null;
  entryDate: string | null;
  balconySqm: number | null;
  totalFloors: number | null;
  furnitureStatus: FurnitureStatus | null;
  // Listing
  sourceUrl: string | null;
  // Derived
  pricePerSqm: number | null;
  matchedAttributes: ApartmentAttributeKey[];
  unverifiedAttributes: ApartmentAttributeKey[];
  // User decision state (left-joined; absent rows surface as "new" with note=null)
  status: UserApartmentStatusKind;
  note: string | null;
};

export type MatchFeedPage = {
  items: MatchFeedItem[];
  /** sent_at of the last item; pass back as `cursor` to fetch the next page. */
  nextCursor: string | null;
};

export type MatchBoard = Record<UserApartmentStatusKind, MatchFeedItem[]>;

export type InboxItem = {
  apartmentId: number;
  sentAt: Date;
  seenAt: Date | null;
  channels: NotifyChannel[];
  // Snapshot for the row preview.
  neighborhood: string | null;
  city: string | null;
  formattedAddress: string | null;
  priceNis: number | null;
  rooms: number | null;
  sqm: number | null;
  sourceUrl: string | null;
};

export type UnreadAlerts = {
  unreadCount: number;
  items: InboxItem[];
};
