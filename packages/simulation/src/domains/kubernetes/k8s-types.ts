export interface ResourceRequirements {
  cpuMillis: number; // e.g. 250 = 0.25 core
  memoryMb: number; // e.g. 256 MiB
}

export type TaintEffect = 'NoSchedule' | 'PreferNoSchedule' | 'NoExecute';

export interface Taint {
  key: string;
  value: string;
  effect: TaintEffect;
}

export interface Toleration {
  key: string;
  value: string;
  effect?: TaintEffect | undefined;
}

export type PodStatus =
  'Pending' | 'ContainerCreating' | 'Running' | 'CrashLoopBackOff' | 'Terminating' | 'Failed';

export type PodQoSClass = 'Guaranteed' | 'Burstable' | 'BestEffort';

export interface PodSpec {
  id: string;
  name: string;
  namespace: string;
  deploymentId: string | null;
  replicaSetId: string | null;
  image: string;
  resources: ResourceRequirements;
  limits?: ResourceRequirements | undefined;
  qosClass?: PodQoSClass | undefined;
  tolerations: Toleration[];
  nodeName: string | null;
  status: PodStatus;
  restarts: number;
  createdAtTick: number;
  pendingReason: string | null;
}

export type K8sNodeStatus = 'Ready' | 'NotReady' | 'SchedulingDisabled';

export interface K8sNode {
  id: string;
  name: string;
  role: 'control-plane' | 'worker';
  status: K8sNodeStatus;
  capacity: ResourceRequirements;
  allocated: ResourceRequirements;
  taints: Taint[];
  podIds: string[];
  color: string;
}

export type DeploymentStrategy = 'RollingUpdate' | 'Recreate';

export interface DeploymentSpec {
  id: string;
  name: string;
  namespace: string;
  replicas: number;
  strategy: DeploymentStrategy;
  maxSurge: number;
  maxUnavailable: number;
  image: string;
  resources: ResourceRequirements;
  tolerations: Toleration[];
  currentRevision: number;
}

export interface ReplicaSetSpec {
  id: string;
  name: string;
  deploymentId: string;
  revision: number;
  replicas: number;
  image: string;
  resources: ResourceRequirements;
}

export interface PodDisruptionBudget {
  id: string;
  name: string;
  deploymentId: string;
  minAvailable: number;
}

export interface K8sClusterState {
  clusterId: string;
  tick: number;
  rngState: number;
  fidelityMode: 'TEXTBOOK' | 'REALISTIC';
  nodes: Record<string, K8sNode>;
  deployments: Record<string, DeploymentSpec>;
  replicaSets: Record<string, ReplicaSetSpec>;
  pods: Record<string, PodSpec>;
  podDisruptionBudgets: Record<string, PodDisruptionBudget>;
  totalReconciliations: number;
  totalPodsScheduled: number;
  totalPodsEvicted: number;
  totalPdbViolationsBlocked: number;
}

export type K8sEventType =
  | 'K8S_APPLY_DEPLOYMENT'
  | 'K8S_SCALE_DEPLOYMENT'
  | 'K8S_UPDATE_IMAGE'
  | 'K8S_NODE_CORDON'
  | 'K8S_NODE_DRAIN'
  | 'K8S_NODE_CRASH'
  | 'K8S_NODE_RECOVER'
  | 'K8S_RECONCILE_TICK'
  | 'K8S_POD_SCHEDULED'
  | 'K8S_POD_TERMINATED'
  | 'K8S_EVICT_UNDER_PRESSURE'
  | 'K8S_APPLY_PDB'
  | 'K8S_CONFIGURE_FIDELITY';

export interface K8sSimEvent {
  id: string;
  tick: number;
  type: K8sEventType;
  payload: Record<string, unknown>;
}
