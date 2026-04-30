ALTER TABLE "user_filters" ALTER COLUMN "strict_unknowns" SET DEFAULT false;--> statement-breakpoint
-- APA-25: existing users inherited the previous strict-by-default value purely
-- because the column had no plain-language UI. Flip them to the new default
-- (notify on unknown) so behavior matches the now-explicit onboarding question.
UPDATE "user_filters" SET "strict_unknowns" = false WHERE "strict_unknowns" = true;
