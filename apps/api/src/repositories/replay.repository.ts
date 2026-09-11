import { and, desc, eq } from 'drizzle-orm';

import { ScenarioScriptSchema, scenarioContentHash, type ScenarioScript } from '@the-visualizer/contracts';

import { db } from '../db/index.js';
import { redis } from '../db/redis.js';
import { simulationReplays, topologies } from '../db/schema.js';
import { ForbiddenError, NotFoundError } from '../utils/errors.js';

const ARTIFACT_TTL_SECONDS = 90 * 24 * 3600;

function artifactKey(hash: string): string {
  return `replay:artifact:${hash}`;
}

export interface StoredReplay {
  id: string;
  topologyId: string;
  seed: number;
  durationTicks: number;
  totalEvents: number;
  contentHash: string;
  createdAt: string;
}

/**
 * Server-side replay persistence.
 *
 * Artifacts (the executable script) are content-addressed and stored in Redis;
 * Postgres holds the durable index row. Replays are de-duplicated per topology
 * by content hash, so re-saving an identical script is idempotent.
 */
export class ReplayRepository {
  public async saveReplay(input: {
    topologyId: string;
    userId: string;
    script: ScenarioScript;
  }): Promise<StoredReplay> {
    const script = ScenarioScriptSchema.parse(input.script);
    await this.assertTopologyAccess(input.topologyId, input.userId);

    const contentHash = scenarioContentHash(script);

    const [existing] = await db
      .select()
      .from(simulationReplays)
      .where(and(eq(simulationReplays.topologyId, input.topologyId), eq(simulationReplays.contentHash, contentHash)))
      .limit(1);
    if (existing) return toStored(existing);

    // Store the artifact first so a DB row never references a missing object.
    await redis.setex(artifactKey(contentHash), ARTIFACT_TTL_SECONDS, JSON.stringify(script));

    const [row] = await db
      .insert(simulationReplays)
      .values({
        topologyId: input.topologyId,
        createdBy: input.userId,
        seed: script.seed,
        durationTicks: Math.max(...script.events.map((e) => e.tick)),
        totalEvents: script.events.length,
        artifactStorageUrl: `redis://${artifactKey(contentHash)}`,
        contentHash,
        metadata: { domainId: script.domainId, title: script.title },
      })
      .returning();
    if (!row) throw new NotFoundError('Failed to persist replay');
    return toStored(row);
  }

  public async getReplay(id: string, userId: string): Promise<{ replay: StoredReplay; script: ScenarioScript }> {
    const [row] = await db.select().from(simulationReplays).where(eq(simulationReplays.id, id)).limit(1);
    if (!row) throw new NotFoundError('Replay not found');
    await this.assertTopologyAccess(row.topologyId, userId);

    const hash = row.contentHash;
    if (!hash) throw new NotFoundError('Replay artifact unavailable');
    const raw = await redis.get(artifactKey(hash));
    if (!raw) throw new NotFoundError('Replay artifact expired');

    const parsed = ScenarioScriptSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) throw new NotFoundError('Replay artifact corrupt');
    // Integrity: the stored artifact must still hash to the indexed address.
    if (scenarioContentHash(parsed.data) !== hash) {
      throw new NotFoundError('Replay artifact failed integrity check');
    }
    return { replay: toStored(row), script: parsed.data };
  }

  public async listReplaysForTopology(topologyId: string, userId: string): Promise<StoredReplay[]> {
    await this.assertTopologyAccess(topologyId, userId);
    const rows = await db
      .select()
      .from(simulationReplays)
      .where(eq(simulationReplays.topologyId, topologyId))
      .orderBy(desc(simulationReplays.createdAt))
      .limit(100);
    return rows.map(toStored);
  }

  private async assertTopologyAccess(topologyId: string, userId: string): Promise<void> {
    const [row] = await db
      .select({ orgId: topologies.orgId })
      .from(topologies)
      .where(eq(topologies.id, topologyId))
      .limit(1);
    if (!row) throw new NotFoundError('Topology not found');
    const { memberships } = await import('../db/schema.js');
    const [member] = await db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(and(eq(memberships.orgId, row.orgId), eq(memberships.userId, userId)))
      .limit(1);
    if (!member) throw new ForbiddenError('Not a member of this topology’s organization');
  }
}

type ReplayRow = typeof simulationReplays.$inferSelect;

function toStored(row: ReplayRow): StoredReplay {
  return {
    id: row.id,
    topologyId: row.topologyId,
    seed: row.seed,
    durationTicks: row.durationTicks,
    totalEvents: row.totalEvents,
    contentHash: row.contentHash ?? '',
    createdAt: row.createdAt.toISOString(),
  };
}

export const replayRepository = new ReplayRepository();
