import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { db } from '../db/index.js';
import { memberships, topologies } from '../db/schema.js';
import { ForbiddenError, NotFoundError } from '../utils/errors.js';

/**
 * Authorization predicate: the row's org must have a membership for this user
 * with a mutating role. Embedded directly into UPDATE/DELETE statements so
 * authorize-and-mutate is a single atomic statement (no check-then-act TOCTOU).
 */
function mutateAccess(userId: string) {
  return sql`EXISTS (
    SELECT 1 FROM "memberships"
    WHERE "memberships"."org_id" = "topologies"."org_id"
      AND "memberships"."user_id" = ${userId}
      AND "memberships"."role" IN ('OWNER', 'ADMIN', 'MEMBER')
  )`;
}

export class TopologyRepository {
  /**
   * Helper to verify if a user belongs to a specific organization.
   */
  private async userHasAccessToOrg(userId: string, orgId: string): Promise<boolean> {
    const [membership] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)));
    return !!membership;
  }

  /**
   * Helper to verify if a user has modification privileges (OWNER, ADMIN, MEMBER) in an org.
   */
  private async userCanMutateInOrg(userId: string, orgId: string): Promise<boolean> {
    const [membership] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)));
    if (!membership) return false;
    return ['OWNER', 'ADMIN', 'MEMBER'].includes(membership.role);
  }

  public async createTopology(
    orgId: string,
    userId: string,
    name: string,
    definition: Record<string, unknown>,
    description?: string,
    visibility: 'PRIVATE' | 'UNLISTED' | 'PUBLIC' = 'PRIVATE',
    domainId: string = 'kafka',
  ) {
    // Verify user belongs to the target organization
    const hasAccess = await this.userCanMutateInOrg(userId, orgId);
    if (!hasAccess) {
      throw new ForbiddenError('User does not have modification access in this organization');
    }

    const shareToken = visibility === 'UNLISTED' ? nanoid(32) : null;

    const [topology] = await db
      .insert(topologies)
      .values({
        orgId,
        createdBy: userId,
        domainId,
        name,
        definition,
        description,
        visibility,
        shareToken,
      })
      .returning();

    if (!topology) throw new NotFoundError('Failed to create topology');
    return topology;
  }

  public async getTopologyById(id: string, userId?: string) {
    if (!userId) {
      const [pub] = await db
        .select()
        .from(topologies)
        .where(and(eq(topologies.id, id), eq(topologies.visibility, 'PUBLIC')));
      return pub || null;
    }

    // Single-query indexed LEFT JOIN checking public visibility or organization membership
    const [row] = await db
      .select({
        topology: topologies,
      })
      .from(topologies)
      .leftJoin(
        memberships,
        and(eq(memberships.orgId, topologies.orgId), eq(memberships.userId, userId)),
      )
      .where(
        and(
          eq(topologies.id, id),
          or(eq(topologies.visibility, 'PUBLIC'), sql`${memberships.userId} IS NOT NULL`),
        ),
      );

    return row?.topology || null;
  }

  public async getTopologyByShareToken(shareToken: string) {
    const [topology] = await db
      .select()
      .from(topologies)
      .where(and(eq(topologies.shareToken, shareToken), eq(topologies.visibility, 'UNLISTED')));
    return topology || null;
  }

  public async listTopologiesForOrg(orgId: string, userId: string) {
    // Single-query indexed INNER JOIN checking membership access
    const rows = await db
      .select({
        topology: topologies,
      })
      .from(topologies)
      .innerJoin(
        memberships,
        and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)),
      )
      .where(eq(topologies.orgId, orgId));

    if (rows.length === 0) {
      const hasOrgAccess = await this.userHasAccessToOrg(userId, orgId);
      if (!hasOrgAccess) {
        throw new ForbiddenError('User is not a member of this organization');
      }
      return [];
    }

    return rows.map((r) => r.topology);
  }

  /**
   * Paginated topology listing for an organization.
   * Composite keyset on (createdAt, id), newest first; cursor encodes both.
   * Enforces membership before returning rows.
   */
  public async listTopologiesForOrgPaginated(
    orgId: string,
    userId: string,
    limit: number,
    cursor?: { createdAt: Date; id: string },
  ) {
    const hasOrgAccess = await this.userHasAccessToOrg(userId, orgId);
    if (!hasOrgAccess) {
      throw new ForbiddenError('User is not a member of this organization');
    }

    const baseCondition = eq(topologies.orgId, orgId);
    const cursorCondition = cursor
      ? or(
          lt(topologies.createdAt, cursor.createdAt),
          and(eq(topologies.createdAt, cursor.createdAt), lt(topologies.id, cursor.id)),
        )
      : undefined;

    const rows = await db
      .select()
      .from(topologies)
      .where(cursorCondition ? and(baseCondition, cursorCondition) : baseCondition)
      .orderBy(desc(topologies.createdAt), desc(topologies.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      topologies: page,
      nextCursor:
        hasMore && last
          ? `${last.createdAt.toISOString()}|${last.id}`
          : null,
    };
  }

  public async updateTopology(
    id: string,
    userId: string,
    updates: {
      name?: string;
      description?: string;
      definition?: Record<string, unknown>;
      visibility?: 'PRIVATE' | 'UNLISTED' | 'PUBLIC';
    },
  ) {
    const [existing] = await db.select().from(topologies).where(eq(topologies.id, id));
    if (!existing) throw new NotFoundError('Topology not found');

    let shareToken = existing.shareToken;
    if (updates.visibility) {
      if (updates.visibility === 'UNLISTED' && !shareToken) {
        shareToken = nanoid(32);
      } else if (updates.visibility !== 'UNLISTED') {
        shareToken = null;
      }
    }

    // Atomic authorize-and-mutate: the EXISTS predicate makes the UPDATE a
    // no-op when the caller lacks a mutating role — no TOCTOU window.
    const [updated] = await db
      .update(topologies)
      .set({
        ...updates,
        shareToken,
        updatedAt: new Date(),
      })
      .where(and(eq(topologies.id, id), mutateAccess(userId)))
      .returning();

    if (!updated) {
      // Row existed at read time: either it was deleted concurrently (404) or
      // the caller lacks rights (403). One cheap re-read disambiguates.
      const [stillThere] = await db
        .select({ id: topologies.id })
        .from(topologies)
        .where(eq(topologies.id, id));
      if (!stillThere) throw new NotFoundError('Topology not found');
      throw new ForbiddenError('User does not have modification rights in this organization');
    }
    return updated;
  }

  public async deleteTopology(id: string, userId: string) {
    const [deleted] = await db
      .delete(topologies)
      .where(and(eq(topologies.id, id), mutateAccess(userId)))
      .returning({ id: topologies.id });

    if (!deleted) {
      const [stillThere] = await db
        .select({ id: topologies.id })
        .from(topologies)
        .where(eq(topologies.id, id));
      if (!stillThere) throw new NotFoundError('Topology not found');
      throw new ForbiddenError('User does not have modification rights in this organization');
    }
    return true;
  }
}
export const topologyRepository = new TopologyRepository();
