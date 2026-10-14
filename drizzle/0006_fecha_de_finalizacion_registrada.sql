ALTER TABLE "quotes" ADD COLUMN "finalized_at_set_by" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "finalized_at_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_finalized_at_set_by_users_id_fk" FOREIGN KEY ("finalized_at_set_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;