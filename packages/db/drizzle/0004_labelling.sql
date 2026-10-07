CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'done', 'failed');--> statement-breakpoint
ALTER TYPE "public"."asset_status" ADD VALUE 'prelabelling' BEFORE 'prelabelled';--> statement-breakpoint
CREATE TABLE "annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"author_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_by" text,
	"locked_at" timestamp with time zone,
	"last_error" text,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"engine" text NOT NULL,
	"engine_version" text NOT NULL,
	"result" jsonb NOT NULL,
	"min_conf" real,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "annotations_asset_version_uq" ON "annotations" USING btree ("asset_id","version");--> statement-breakpoint
CREATE INDEX "jobs_claim_idx" ON "jobs" USING btree ("kind","status","run_after");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_dedupe_uq" ON "jobs" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "predictions_asset_idx" ON "predictions" USING btree ("asset_id","created_at");