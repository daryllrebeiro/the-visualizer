import {
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import type { KafkaClusterState } from '@the-visualizer/contracts';

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 64 }).unique().notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  name: varchar('name', { length: 255 }),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const memberships = pgTable(
  'memberships',
  {
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    orgId: uuid('org_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    role: varchar('role', { length: 32 })
      .$type<'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'>()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.orgId] })],
);

export const topologies = pgTable('topologies', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  visibility: varchar('visibility', { length: 32 })
    .$type<'PRIVATE' | 'UNLISTED' | 'PUBLIC'>()
    .default('PRIVATE')
    .notNull(),
  shareToken: varchar('share_token', { length: 64 }).unique(),
  specVersion: integer('spec_version').default(1).notNull(),
  definition: jsonb('definition').$type<KafkaClusterState>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const simulationReplays = pgTable('simulation_replays', {
  id: uuid('id').primaryKey().defaultRandom(),
  topologyId: uuid('topology_id')
    .references(() => topologies.id, { onDelete: 'cascade' })
    .notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  seed: integer('seed').notNull(),
  durationTicks: integer('duration_ticks').notNull(),
  totalEvents: integer('total_events').notNull(),
  artifactStorageUrl: text('artifact_storage_url').notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
