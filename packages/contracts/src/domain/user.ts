import { z } from 'zod';

export const UserRoleSchema = z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().max(255),
  name: z.string().max(255).nullable(),
  avatarUrl: z.string().url().nullable(),
  createdAt: z.string().datetime(),
});
export type User = z.infer<typeof UserSchema>;

export const OrganizationSchema = z.object({
  id: z.string().uuid(),
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase kebab-case'),
  name: z.string().min(1).max(255),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Organization = z.infer<typeof OrganizationSchema>;

export const MembershipSchema = z.object({
  userId: z.string().uuid(),
  orgId: z.string().uuid(),
  role: UserRoleSchema,
});
export type Membership = z.infer<typeof MembershipSchema>;
