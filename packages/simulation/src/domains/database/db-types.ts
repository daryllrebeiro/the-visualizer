export type ConsistencyLevel =
  'ONE' | 'TWO' | 'THREE' | 'QUORUM' | 'ALL' | 'LOCAL_QUORUM' | 'EACH_QUORUM';

export type DBNodeStatus = 'ALIVE' | 'DOWN' | 'JOINING' | 'LEAVING';

export interface DBValueRecord {
  key: string;
  value: string;
  version: number;
  timestamp: number;
  vectorClock: Record<string, number>;
  deleted?: boolean | undefined;
}

export interface HintedHandoffRecord {
  targetNodeId: string;
  key: string;
  record: DBValueRecord;
  storedAtTick: number;
}

export interface DBNode {
  id: string;
  host: string;
  status: DBNodeStatus;
  tokens: number[];
  storage: Record<string, DBValueRecord>;
  hints: HintedHandoffRecord[];
  color: string;
}

export interface RingTokenMapping {
  token: number;
  nodeId: string;
}

export interface DBClusterState {
  clusterId: string;
  tick: number;
  rngState: number;
  fidelityMode: 'TEXTBOOK' | 'REALISTIC';
  vnodesPerNode: number; // 3 for visual textbook, 256 for realistic Cassandra
  hintedHandoffEnabled: boolean;
  replicationFactor: number;
  writeConsistency: ConsistencyLevel;
  readConsistency: ConsistencyLevel;
  nodes: Record<string, DBNode>;
  ringTokens: RingTokenMapping[];
  totalOperations: number;
  staleReadsObserved: number;
  readRepairsCompleted: number;
}

export type DBEventType =
  | 'DB_WRITE_REQUEST'
  | 'DB_WRITE_ACK'
  | 'DB_READ_REQUEST'
  | 'DB_READ_REPAIR'
  | 'DB_HINT_DELIVER'
  | 'DB_NODE_JOIN'
  | 'DB_NODE_LEAVE'
  | 'DB_NODE_CRASH'
  | 'DB_NODE_RECOVER'
  | 'DB_UPDATE_CONSISTENCY'
  | 'DB_CONFIGURE_FIDELITY';

export interface DBSimEvent {
  id: string;
  tick: number;
  type: DBEventType;
  payload: Record<string, unknown>;
}

export interface DBWriteRequestPayload {
  key: string;
  value: string;
  consistencyLevel?: ConsistencyLevel | undefined;
  clientRequestId?: string | undefined;
}

export interface DBReadRequestPayload {
  key: string;
  consistencyLevel?: ConsistencyLevel | undefined;
  clientRequestId?: string | undefined;
}
