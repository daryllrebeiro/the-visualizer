ALTER TABLE "simulation_replays" ADD COLUMN "content_hash" text;--> statement-breakpoint
CREATE INDEX "idx_simulation_replays_content_hash" ON "simulation_replays" USING btree ("content_hash");