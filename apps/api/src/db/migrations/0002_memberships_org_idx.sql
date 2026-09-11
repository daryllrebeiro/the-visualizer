DROP INDEX "idx_memberships_user_id";--> statement-breakpoint
CREATE INDEX "idx_memberships_org_id" ON "memberships" USING btree ("org_id");