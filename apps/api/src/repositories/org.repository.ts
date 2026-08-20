import { and, eq } from 'drizzle-orm';

import { db } from '../db/index.js';
import { memberships, organizations, users } from '../db/schema.js';

export interface OrgMember {
  userId: string;
  email: string;
  name: string | null;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
}

export class OrgRepository {
  public async createOrg(slug: string, name: string) {
    const [org] = await db.insert(organizations).values({ slug, name }).returning();
    if (!org) throw new Error('Failed to create organization');
    return org;
  }

  public async getOrgById(id: string) {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
    return org;
  }

  public async getOrgBySlug(slug: string) {
    const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug));
    return org;
  }

  public async addMember(
    userId: string,
    orgId: string,
    role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER',
  ) {
    const [membership] = await db.insert(memberships).values({ userId, orgId, role }).returning();
    if (!membership) throw new Error('Failed to add member to organization');
    return membership;
  }

  public async getMembers(orgId: string): Promise<OrgMember[]> {
    const list = await db
      .select({
        userId: memberships.userId,
        email: users.email,
        name: users.name,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(eq(memberships.orgId, orgId));
    return list;
  }

  public async getMembership(userId: string, orgId: string) {
    const [membership] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)));
    return membership;
  }

  public async getUserOrgs(userId: string) {
    return db
      .select({
        id: organizations.id,
        slug: organizations.slug,
        name: organizations.name,
        createdAt: organizations.createdAt,
        updatedAt: organizations.updatedAt,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(organizations, eq(memberships.orgId, organizations.id))
      .where(eq(memberships.userId, userId));
  }
}
export const orgRepository = new OrgRepository();
