import { eq } from 'drizzle-orm';

import { db } from '../db/index.js';
import { memberships, organizations, users } from '../db/schema.js';

export interface UserOrgMembership {
  orgId: string;
  slug: string;
  name: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
}

export class UserRepository {
  public async createUser(email: string, name?: string, avatarUrl?: string) {
    const [user] = await db.insert(users).values({ email, name, avatarUrl }).returning();
    if (!user) throw new Error('Failed to create user');
    return user;
  }

  public async getUserById(id: string) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  public async getUserByEmail(email: string) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  public async getUserMemberships(userId: string): Promise<UserOrgMembership[]> {
    const list = await db
      .select({
        orgId: memberships.orgId,
        slug: organizations.slug,
        name: organizations.name,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(organizations, eq(memberships.orgId, organizations.id))
      .where(eq(memberships.userId, userId));
    return list;
  }
}
export const userRepository = new UserRepository();
