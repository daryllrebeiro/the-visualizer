import { z } from 'zod';

export const RaftRoleSchema = z.enum(['LEADER', 'CANDIDATE', 'FOLLOWER']);
export type RaftRole = z.infer<typeof RaftRoleSchema>;

export const RaftNodeStatusSchema = z.enum(['ALIVE', 'CRASHED', 'ISOLATED']);
export type RaftNodeStatus = z.infer<typeof RaftNodeStatusSchema>;

export const RaftLogEntrySchema = z.object({
  term: z.number().int().nonnegative(),
  index: z.number().int().positive(),
  command: z.string(),
  clientRequestId: z.string().optional(),
});
export type RaftLogEntry = z.infer<typeof RaftLogEntrySchema>;

export const RaftNodeSchema = z.object({
  id: z.string().min(1),
  role: RaftRoleSchema,
  status: RaftNodeStatusSchema,
  currentTerm: z.number().int().nonnegative(),
  votedFor: z.string().nullable(),
  log: z.array(RaftLogEntrySchema),
  commitIndex: z.number().int().nonnegative(),
  lastApplied: z.number().int().nonnegative(),
  leaderId: z.string().nullable(),
  electionTimeoutTicks: z.number().int().positive(),
  currentElectionCountdown: z.number().int().nonnegative(),
  heartbeatIntervalTicks: z.number().int().positive(),
  votesReceived: z.array(z.string()),
  // Leader-specific volatile state
  nextIndex: z.record(z.string(), z.number().int().positive()).optional(),
  matchIndex: z.record(z.string(), z.number().int().nonnegative()).optional(),
});
export type RaftNode = z.infer<typeof RaftNodeSchema>;

export const RaftClusterStateSchema = z.object({
  clusterId: z.string(),
  tick: z.number().nonnegative(),
  rngState: z.number().int(),
  nodes: z.record(z.string(), RaftNodeSchema),
  isolatedNodeIds: z.array(z.string()),
  activeLeaderId: z.string().nullable(),
  highestTerm: z.number().int().nonnegative(),
});
export type RaftClusterState = z.infer<typeof RaftClusterStateSchema>;

// ─── Raft RPC Messages ───

export const RequestVoteArgsSchema = z.object({
  term: z.number().int().nonnegative(),
  candidateId: z.string(),
  lastLogIndex: z.number().int().nonnegative(),
  lastLogTerm: z.number().int().nonnegative(),
});
export type RequestVoteArgs = z.infer<typeof RequestVoteArgsSchema>;

export const RequestVoteReplySchema = z.object({
  term: z.number().int().nonnegative(),
  voteGranted: z.boolean(),
  fromNodeId: z.string(),
});
export type RequestVoteReply = z.infer<typeof RequestVoteReplySchema>;

export const AppendEntriesArgsSchema = z.object({
  term: z.number().int().nonnegative(),
  leaderId: z.string(),
  prevLogIndex: z.number().int().nonnegative(),
  prevLogTerm: z.number().int().nonnegative(),
  entries: z.array(RaftLogEntrySchema),
  leaderCommit: z.number().int().nonnegative(),
});
export type AppendEntriesArgs = z.infer<typeof AppendEntriesArgsSchema>;

export const AppendEntriesReplySchema = z.object({
  term: z.number().int().nonnegative(),
  success: z.boolean(),
  matchIndex: z.number().int().nonnegative(),
  fromNodeId: z.string(),
});
export type AppendEntriesReply = z.infer<typeof AppendEntriesReplySchema>;
