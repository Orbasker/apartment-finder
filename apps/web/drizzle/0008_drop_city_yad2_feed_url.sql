-- APA-36: cities.yad2_feed_url is unused after APA-35 (region-based Yad2
-- collectors). Every Yad2 fetch now goes through yad2_regions.feed_url and
-- markers are routed to cities by Hebrew name match in the worker adapter.
-- Drop the dead column.
--
-- Idempotent: safe to re-run if a partial apply previously dropped the column.

ALTER TABLE "cities" DROP COLUMN IF EXISTS "yad2_feed_url";
