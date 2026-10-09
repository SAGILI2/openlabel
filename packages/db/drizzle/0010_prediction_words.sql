ALTER TABLE "predictions" ADD COLUMN "words" integer;--> statement-breakpoint
UPDATE "predictions" p SET "words" = (
  SELECT count(*) FROM jsonb_array_elements(coalesce(p."result"->'lines', '[]'::jsonb)) l,
    jsonb_array_elements(coalesce(l->'words', '[]'::jsonb)) w
);
