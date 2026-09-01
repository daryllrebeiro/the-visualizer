export type RaftRole = 'LEADER' | 'CANDIDATE' | 'FOLLOWER';
export type RaftNodeStatus = 'ALIVE' | 'CRASHED' | 'ISOLATED';

export interface RaftLogEntry {
  term: number;
  index: number;
  command: string;
  clientRequestId?: string | undefined;
}

export interface RaftNode {
  id: string;
  role: RaftRole;
  status: RaftNodeStatus;
  currentTerm: number;
  votedFor: string | null;
  log: RaftLogEntry[];
  commitIndex: number;
  lastApplied: number;
  leaderId: string | null;
  electionTimeoutTicks: number;
  currentElectionCountdown: number;
  heartbeatIntervalTicks: number;
  votesReceived: string[];
  nextIndex?: Record<string, number> | undefined;
  matchIndex?: Record<string, number> | undefined;
}

export interface RaftClusterState {
  clusterId: string;
  tick: number;
  rngState: number;
  nodes: Record<string, RaftNode>;
  isolatedNodeIds: string[];
  activeLeaderId: string | null;
  highestTerm: number;
}

export type RaftEventType =
  | 'RAFT_TICK'
  | 'RAFT_ELECTION_TIMEOUT'
  | 'RAFT_REQUEST_VOTE'
  | 'RAFT_VOTE_REPLY'
  | 'RAFT_HEARTBEAT'
  | 'RAFT_APPEND_ENTRIES'
  | 'RAFT_APPEND_REPLY'
  | 'RAFT_CLIENT_PROPOSE'
  | 'RAFT_NODE_CRASH'
  | 'RAFT_NODE_RECOVER'
  | 'RAFT_NETWORK_PARTITION'
  | 'RAFT_NETWORK_HEAL';

export interface RaftSimEvent {
  id: string;
  tick: number;
  type: RaftEventType;
  payload: Record<string, unknown>;
}

export interface RequestVotePayload {
  term: number;
  candidateId: string;
  lastLogIndex: number;
  lastLogTerm: number;
  targetNodeId: string;
}

export interface VoteReplyPayload {
  term: number;
  voteGranted: boolean;
  fromNodeId: string;
  candidateId: string;
}

export interface AppendEntriesPayload {
  term: number;
  leaderId: string;
  prevLogIndex: number;
  prevLogTerm: number;
  entries: RaftLogEntry[];
  leaderCommit: number;
  targetNodeId: string;
}

export interface AppendReplyPayload {
  term: number;
  success: boolean;
  matchIndex: number;
  fromNodeId: string;
  leaderId: string;
}
