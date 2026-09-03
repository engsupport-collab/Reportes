CREATE TABLE "attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"blob_url" text NOT NULL,
	"thumbnail_url" text,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"currency" text DEFAULT 'COP' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"ip" text PRIMARY KEY NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"first_attempt_at" timestamp with time zone NOT NULL,
	"last_attempt_at" timestamp with time zone NOT NULL,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "quote_sequences" (
	"year" integer PRIMARY KEY NOT NULL,
	"last_value" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"quote_number" text,
	"project_name" text NOT NULL,
	"client_id" text NOT NULL,
	"status" text DEFAULT 'en_curso' NOT NULL,
	"purchase_order_no" text,
	"due_date" timestamp with time zone,
	"description" text,
	"amount" integer,
	"revisada" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "report_events" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"tipo" text NOT NULL,
	"user_id" text,
	"motivo" text,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_tags" (
	"report_id" text NOT NULL,
	"tag" text NOT NULL,
	CONSTRAINT "report_tags_report_id_tag_pk" PRIMARY KEY("report_id","tag")
);
--> statement-breakpoint
CREATE TABLE "report_viaticos" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"concepto" text,
	"fecha_gasto" timestamp with time zone,
	"blob_url" text NOT NULL,
	"thumbnail_url" text,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"amount" integer,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text DEFAULT 'corp' NOT NULL,
	"author_id" text NOT NULL,
	"type" text DEFAULT 'servicio' NOT NULL,
	"linked_report_id" text,
	"quote_id" text,
	"project_name" text NOT NULL,
	"purchase_order_no" text,
	"quote_number" text,
	"client_name" text NOT NULL,
	"work_date" timestamp with time zone NOT NULL,
	"details" text,
	"service_type" text,
	"status" text DEFAULT 'en_proceso' NOT NULL,
	"completed_at" timestamp with time zone,
	"signature_url" text,
	"signature_name" text,
	"signature_email" text,
	"signed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "user_companies" (
	"user_id" text NOT NULL,
	"company_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_companies_user_id_company_id_pk" PRIMARY KEY("user_id","company_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" text NOT NULL,
	"role" text DEFAULT 'empleado' NOT NULL,
	"locale" text DEFAULT 'es' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_events" ADD CONSTRAINT "report_events_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_events" ADD CONSTRAINT "report_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_tags" ADD CONSTRAINT "report_tags_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_viaticos" ADD CONSTRAINT "report_viaticos_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_linked_report_id_reports_id_fk" FOREIGN KEY ("linked_report_id") REFERENCES "public"."reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_companies" ADD CONSTRAINT "user_companies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_companies" ADD CONSTRAINT "user_companies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_report_idx" ON "attachments" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "clients_company_active_idx" ON "clients" USING btree ("company_id","is_active");--> statement-breakpoint
CREATE INDEX "login_attempts_last_idx" ON "login_attempts" USING btree ("last_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_quote_number_unique" ON "quotes" USING btree ("quote_number");--> statement-breakpoint
CREATE INDEX "quotes_company_status_idx" ON "quotes" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "quotes_company_revisada_idx" ON "quotes" USING btree ("company_id","revisada");--> statement-breakpoint
CREATE INDEX "quotes_project_idx" ON "quotes" USING btree ("project_name");--> statement-breakpoint
CREATE INDEX "quotes_client_idx" ON "quotes" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "report_events_report_idx" ON "report_events" USING btree ("report_id","created_at");--> statement-breakpoint
CREATE INDEX "report_tags_tag_idx" ON "report_tags" USING btree ("tag");--> statement-breakpoint
CREATE INDEX "report_viaticos_report_idx" ON "report_viaticos" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "reports_company_created_idx" ON "reports" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "reports_company_author_idx" ON "reports" USING btree ("company_id","author_id");--> statement-breakpoint
CREATE INDEX "reports_company_status_idx" ON "reports" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "reports_company_service_idx" ON "reports" USING btree ("company_id","service_type");--> statement-breakpoint
CREATE INDEX "reports_work_date_idx" ON "reports" USING btree ("work_date");--> statement-breakpoint
CREATE INDEX "reports_purchase_order_idx" ON "reports" USING btree ("purchase_order_no");--> statement-breakpoint
CREATE INDEX "reports_type_idx" ON "reports" USING btree ("company_id","type");--> statement-breakpoint
CREATE INDEX "reports_linked_report_idx" ON "reports" USING btree ("linked_report_id");--> statement-breakpoint
CREATE INDEX "reports_quote_idx" ON "reports" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "user_companies_company_idx" ON "user_companies" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");