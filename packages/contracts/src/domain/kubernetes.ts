import { z } from 'zod';

export const ResourceRequirementsSchema = z.object({
  cpuMillis: z.number().int().nonnegative(), // e.g. 250 = 0.25 core
  memoryMb: z.number().int().nonnegative(), // e.g. 256 = 256 MiB
});
export type ResourceRequirements = z.infer<typeof ResourceRequirementsSchema>;

export const TaintEffectSchema = z.enum(['NoSchedule', 'PreferNoSchedule', 'NoExecute']);
export type TaintEffect = z.infer<typeof TaintEffectSchema>;

export const TaintSchema = z.object({
  key: z.string(),
  value: z.string(),
  effect: TaintEffectSchema,
});
export type Taint = z.infer<typeof TaintSchema>;

export const TolerationSchema = z.object({
  key: z.string(),
  value: z.string(),
  effect: TaintEffectSchema.optional(),
});
export type Toleration = z.infer<typeof TolerationSchema>;

export const PodStatusSchema = z.enum([
  'Pending',
  'ContainerCreating',
  'Running',
  'CrashLoopBackOff',
  'Terminating',
  'Failed',
]);
export type PodStatus = z.infer<typeof PodStatusSchema>;

export const PodSpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  namespace: z.string().default('default'),
  deploymentId: z.string().nullable().default(null),
  replicaSetId: z.string().nullable().default(null),
  image: z.string(),
  resources: ResourceRequirementsSchema,
  tolerations: z.array(TolerationSchema).default([]),
  nodeName: z.string().nullable().default(null),
  status: PodStatusSchema,
  restarts: z.number().int().nonnegative().default(0),
  createdAtTick: z.number().nonnegative(),
  pendingReason: z.string().nullable().default(null),
});
export type PodSpec = z.infer<typeof PodSpecSchema>;

export const K8sNodeStatusSchema = z.enum(['Ready', 'NotReady', 'SchedulingDisabled']);
export type K8sNodeStatus = z.infer<typeof K8sNodeStatusSchema>;

export const K8sNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.enum(['control-plane', 'worker']),
  status: K8sNodeStatusSchema,
  capacity: ResourceRequirementsSchema,
  allocated: ResourceRequirementsSchema,
  taints: z.array(TaintSchema).default([]),
  podIds: z.array(z.string()).default([]),
  color: z.string(),
});
export type K8sNode = z.infer<typeof K8sNodeSchema>;

export const DeploymentStrategySchema = z.enum(['RollingUpdate', 'Recreate']);
export type DeploymentStrategy = z.infer<typeof DeploymentStrategySchema>;

export const DeploymentSpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  namespace: z.string().default('default'),
  replicas: z.number().int().nonnegative(),
  strategy: DeploymentStrategySchema.default('RollingUpdate'),
  maxSurge: z.number().int().nonnegative().default(1),
  maxUnavailable: z.number().int().nonnegative().default(0),
  image: z.string(),
  resources: ResourceRequirementsSchema,
  tolerations: z.array(TolerationSchema).default([]),
  currentRevision: z.number().int().positive().default(1),
});
export type DeploymentSpec = z.infer<typeof DeploymentSpecSchema>;

export const ReplicaSetSpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  deploymentId: z.string(),
  revision: z.number().int().positive(),
  replicas: z.number().int().nonnegative(),
  image: z.string(),
  resources: ResourceRequirementsSchema,
});
export type ReplicaSetSpec = z.infer<typeof ReplicaSetSpecSchema>;

export const K8sClusterStateSchema = z.object({
  clusterId: z.string(),
  tick: z.number().nonnegative(),
  rngState: z.number().int(),
  nodes: z.record(z.string(), K8sNodeSchema),
  deployments: z.record(z.string(), DeploymentSpecSchema),
  replicaSets: z.record(z.string(), ReplicaSetSpecSchema),
  pods: z.record(z.string(), PodSpecSchema),
  totalReconciliations: z.number().int().nonnegative().default(0),
  totalPodsScheduled: z.number().int().nonnegative().default(0),
  totalPodsEvicted: z.number().int().nonnegative().default(0),
});
export type K8sClusterState = z.infer<typeof K8sClusterStateSchema>;
