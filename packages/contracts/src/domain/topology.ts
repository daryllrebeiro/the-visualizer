import { z } from 'zod';

export const TopologyVisibilitySchema = z.enum(['PRIVATE', 'UNLISTED', 'PUBLIC']);
export type TopologyVisibility = z.infer<typeof TopologyVisibilitySchema>;

export const TopologySchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  createdBy: z.string().uuid().nullable(),
  name: z.string().min(1).max(255),
  description: z.string().max(2000).nullable(),
  visibility: TopologyVisibilitySchema,
  shareToken: z.string().length(32).nullable(),
  specVersion: z.number().int().positive(),
  definition: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Topology = z.infer<typeof TopologySchema>;

export const CreateTopologySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  visibility: TopologyVisibilitySchema.optional().default('PRIVATE'),
  definition: z.record(z.string(), z.unknown()),
});
export type CreateTopology = z.infer<typeof CreateTopologySchema>;

export const UpdateTopologySchema = CreateTopologySchema.partial();
export type UpdateTopology = z.infer<typeof UpdateTopologySchema>;
