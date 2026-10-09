DROP INDEX "jobs_claim_idx";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "priority" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "jobs_claim_idx" ON "jobs" USING btree ("kind","status","priority","run_after");