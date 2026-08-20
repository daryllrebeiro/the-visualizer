import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import type { KafkaClusterState } from '@the-visualizer/contracts';

import { db } from '../db/index.js';
import { memberships, topologies } from '../db/schema.js';

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
    definition: KafkaClusterState,
    description?: string,
    visibility: 'PRIVATE' | 'UNLISTED' | 'PUBLIC' = 'PRIVATE',
  ) {
    // Verify user belongs to the target organization
    const hasAccess = await this.userCanMutateInOrg(userId, orgId);
    if (!hasAccess) {
      throw new Error('Unauthorized: User does not have modification access in this organization');
    }

    const shareToken = visibility === 'UNLISTED' ? nanoid(32) : null;

    const [topology] = await db
      .insert(topologies)
      .values({
        orgId,
        createdBy: userId,
        name,
        definition,
        description,
        visibility,
        shareToken,
      })
      .returning();

    if (!topology) throw new Error('Failed to create topology');
    return topology;
  }

  public async getTopologyById(id: string, userId?: string) {
    const [topology] = await db.select().from(topologies).where(eq(topologies.id, id));
    if (!topology) return null;

    // Visibility checks
    if (topology.visibility === 'PUBLIC') {
      return topology;
    }

    if (!userId) {
      // If no user is logged in and visibility is not PUBLIC, block access
      return null;
    }

    // Check if the user is a member of the organization
    const hasOrgAccess = await this.userHasAccessToOrg(userId, topology.orgId);
    if (hasOrgAccess) {
      return topology;
    }

    return null;
  }

  public async getTopologyByShareToken(shareToken: string) {
    const [topology] = await db
      .select()
      .from(topologies)
      .where(and(eq(topologies.shareToken, shareToken), eq(topologies.visibility, 'UNLISTED')));
    return topology || null;
  }

  public async listTopologiesForOrg(orgId: string, userId: string) {
    const hasOrgAccess = await this.userHasAccessToOrg(userId, orgId);
    if (!hasOrgAccess) {
      throw new Error('Unauthorized: User is not a member of this organization');
    }

    return db.select().from(topologies).where(eq(topologies.orgId, orgId));
  }

  public async updateTopology(
    id: string,
    userId: string,
    updates: {
      name?: string;
      description?: string;
      definition?: KafkaClusterState;
      visibility?: 'PRIVATE' | 'UNLISTED' | 'PUBLIC';
    },
  ) {
    const [topology] = await db.select().from(topologies).where(eq(topologies.id, id));
    if (!topology) throw new Error('Topology not found');

    const canMutate = await this.userCanMutateInOrg(userId, topology.orgId);
    if (!canMutate) {
      throw new Error('Unauthorized: User does not have modification rights in this organization');
    }

    let shareToken = topology.shareToken;
    if (updates.visibility) {
      if (updates.visibility === 'UNLISTED' && !shareToken) {
        shareToken = nanoid(32);
      } else if (updates.visibility !== 'UNLISTED') {
        shareToken = null;
      }
    }

    const [updated] = await db
      .update(topologies)
      .set({
        ...updates,
        shareToken,
        updatedAt: new Date(),
      })
      .where(eq(topologies.id, id))
      .returning();

    if (!updated) throw new Error('Failed to update topology');
    return updated;
  }

  public async deleteTopology(id: string, userId: string) {
    const [topology] = await db.select().from(topologies).where(eq(topologies.id, id));
    if (!topology) throw new Error('Topology not found');

    const canMutate = await this.userCanMutateInOrg(userId, topology.orgId);
    if (!canMutate) {
      throw new Error('Unauthorized: User does not have modification rights in this organization');
    }

    await db.delete(topologies).where(eq(topologies.id, id));
    return true;
  }
}
export const topologyRepository = new TopologyRepository();
