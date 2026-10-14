ALTER TABLE "quotes" ADD COLUMN "finalized_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "quotes_company_finalized_idx" ON "quotes" USING btree ("company_id","finalized_at");