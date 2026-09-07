ALTER TABLE "topologies" ADD COLUMN IF NOT EXISTS "domain_id" varchar(64) DEFAULT 'kafka' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_memberships_user_id" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_simulation_replays_topology_id" ON "simulation_replays" USING btree ("topology_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_simulation_replays_created_by" ON "simulation_replays" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_topologies_org_id" ON "topologies" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_topologies_created_by" ON "topologies" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_topologies_domain_org" ON "topologies" USING btree ("domain_id","org_id");