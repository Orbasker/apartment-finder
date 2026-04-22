CREATE INDEX "judgments_decision_idx" ON "judgments" USING btree ("decision");--> statement-breakpoint
CREATE INDEX "judgments_score_idx" ON "judgments" USING btree ("score");--> statement-breakpoint
CREATE INDEX "listings_ingested_at_idx" ON "listings" USING btree ("ingested_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "listings_source_idx" ON "listings" USING btree ("source");--> statement-breakpoint
CREATE INDEX "listings_price_nis_idx" ON "listings" USING btree ("price_nis");--> statement-breakpoint
CREATE INDEX "listings_rooms_idx" ON "listings" USING btree ("rooms");