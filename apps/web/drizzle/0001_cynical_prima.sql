ALTER TABLE "listings" DROP CONSTRAINT "listings_source_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "listings_source_unique" ON "listings" USING btree ("source","source_id");