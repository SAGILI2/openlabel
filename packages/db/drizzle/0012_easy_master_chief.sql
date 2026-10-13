ALTER TABLE "projects" ADD COLUMN "classes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "multi_label" boolean DEFAULT false NOT NULL;