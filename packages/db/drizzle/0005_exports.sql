CREATE TYPE "public"."dataset_split" AS ENUM('train', 'val', 'test');--> statement-breakpoint
CREATE TYPE "public"."export_status" AS ENUM('queued', 'running', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "export_items" (
	"export_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"annotation_id" uuid NOT NULL,
	"split" "dataset_split" NOT NULL,
	CONSTRAINT "export_items_export_id_asset_id_pk" PRIMARY KEY("export_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"format" text NOT NULL,
	"options" jsonb NOT NULL,
	"status" "export_status" DEFAULT 'queued' NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"storage_key" text,
	"byte_size" bigint,
	"error" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "export_items" ADD CONSTRAINT "export_items_export_id_exports_id_fk" FOREIGN KEY ("export_id") REFERENCES "public"."exports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_items" ADD CONSTRAINT "export_items_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_items" ADD CONSTRAINT "export_items_annotation_id_annotations_id_fk" FOREIGN KEY ("annotation_id") REFERENCES "public"."annotations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "export_items_export_idx" ON "export_items" USING btree ("export_id");--> statement-breakpoint
CREATE INDEX "exports_project_idx" ON "exports" USING btree ("project_id","created_at");