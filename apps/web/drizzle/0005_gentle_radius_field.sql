-- Idempotent: safe when radius columns were added manually (e.g. old 0004_careful_iron_patriot on main).
ALTER TABLE "user_filters" ADD COLUMN IF NOT EXISTS "center_lat" double precision;
--> statement-breakpoint
ALTER TABLE "user_filters" ADD COLUMN IF NOT EXISTS "center_lon" double precision;
--> statement-breakpoint
ALTER TABLE "user_filters" ADD COLUMN IF NOT EXISTS "radius_km" numeric;
