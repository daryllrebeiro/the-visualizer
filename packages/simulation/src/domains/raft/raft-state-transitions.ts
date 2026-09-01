import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import type {
  AppendEntriesPayload,
  AppendReplyPayload,
  RaftClusterState,
  RaftLogEntry,
  RaftNode,
  RaftSimEvent,
  RequestVotePayload,
  VoteReplyPayload,
} from './raft-types.js';

export interface RaftTransitionResult {
  nextState: RaftClusterState;
  emittedEvents: RaftSimEvent[];
}

export function createDefaultRaftCluster(
  clusterId = 'raft-cluster-1',
  nodeCount = 5,
  seed = 42,
): RaftClusterState {
  const rng = new DeterministicRNG(seed);
  const nodes: Record<string, RaftNode> = {};

  for (let i = 1; i <= nodeCount; i++) {
    const id = String(i);
    // Randomized election timeout between 150 and 300 ticks
    const timeout = rng.nextInt(150, 300);
    nodes[id] = {
      id,
      role: 'FOLLOWER',
      status: 'ALIVE',
      currentTerm: 0,
      votedFor: null,
      log: [],
      commitIndex: 0,
      lastApplied: 0,
      leaderId: null,
      electionTimeoutTicks: timeout,
      currentElectionCountdown: timeout,
      heartbeatIntervalTicks: 50,
      votesReceived: [],
    };
  }

  return {
    clusterId,
    tick: 0,
    rngState: rng.getState(),
    nodes,
    isolatedNodeIds: [],
    activeLeaderId: null,
    highestTerm: 0,
  };
}

export function pureRaftTransition(
  state: RaftClusterState,
  event: RaftSimEvent,
  rng: DeterministicRNG,
): RaftTransitionResult {
  const nextState: RaftClusterState = JSON.parse(JSON.stringify(state)) as RaftClusterState;
  const emittedEvents: RaftSimEvent[] = [];

  nextState.tick = event.tick;

  switch (event.type) {
    case 'RAFT_TICK':
      handleRaftTick(nextState, rng, emittedEvents);
      break;
    case 'RAFT_ELECTION_TIMEOUT':
      handleElectionTimeout(nextState, event, rng, emittedEvents);
      break;
    case 'RAFT_REQUEST_VOTE':
      handleRequestVote(nextState, event, emittedEvents);
      break;
    case 'RAFT_VOTE_REPLY':
      handleVoteReply(nextState, event, emittedEvents);
      break;
    case 'RAFT_HEARTBEAT':
      handleHeartbeat(nextState, event, emittedEvents);
      break;
    case 'RAFT_APPEND_ENTRIES':
      handleAppendEntries(nextState, event, emittedEvents);
      break;
    case 'RAFT_APPEND_REPLY':
      handleAppendReply(nextState, event);
      break;
    case 'RAFT_CLIENT_PROPOSE':
      handleClientPropose(nextState, event, emittedEvents);
      break;
    case 'RAFT_NODE_CRASH':
      handleNodeCrash(nextState, event);
      break;
    case 'RAFT_NODE_RECOVER':
      handleNodeRecover(nextState, event);
      break;
    case 'RAFT_NETWORK_PARTITION':
      handleNetworkPartition(nextState, event);
      break;
    case 'RAFT_NETWORK_HEAL':
      handleNetworkHeal(nextState);
      break;
  }

  nextState.rngState = rng.getState();
  return { nextState, emittedEvents };
}

function isIsolated(state: RaftClusterState, nodeId: string): boolean {
  return state.isolatedNodeIds.includes(nodeId);
}

function handleRaftTick(
  state: RaftClusterState,
  rng: DeterministicRNG,
  emittedEvents: RaftSimEvent[],
): void {
  for (const node of Object.values(state.nodes)) {
    if (node.status !== 'ALIVE') continue;

    if (node.role === 'LEADER') {
      if (state.tick % node.heartbeatIntervalTicks === 0) {
        emittedEvents.push({
          id: `hb-${node.id}-${state.tick}`,
          tick: state.tick,
          type: 'RAFT_HEARTBEAT',
          payload: { leaderId: node.id },
        });
      }
    } else {
      node.currentElectionCountdown--;
      if (node.currentElectionCountdown <= 0) {
        // Reset randomized countdown
        node.currentElectionCountdown = node.electionTimeoutTicks + rng.nextInt(0, 50);
        emittedEvents.push({
          id: `timeout-${node.id}-${state.tick}`,
          tick: state.tick,
          type: 'RAFT_ELECTION_TIMEOUT',
          payload: { candidateId: node.id },
        });
      }
    }
  }
}

function handleElectionTimeout(
  state: RaftClusterState,
  event: RaftSimEvent,
  rng: DeterministicRNG,
  emittedEvents: RaftSimEvent[],
): void {
  const candidateId = String(event.payload['candidateId'] ?? '');
  const node = state.nodes[candidateId];
  if (!node || node.status !== 'ALIVE') return;

  node.role = 'CANDIDATE';
  node.currentTerm += 1;
  node.votedFor = candidateId;
  node.votesReceived = [candidateId];
  node.currentElectionCountdown = node.electionTimeoutTicks + rng.nextInt(0, 50);

  if (node.currentTerm > state.highestTerm) {
    state.highestTerm = node.currentTerm;
  }

  const lastLog = node.log[node.log.length - 1];
  const lastLogIndex = lastLog ? lastLog.index : 0;
  const lastLogTerm = lastLog ? lastLog.term : 0;

  // Broadcast RequestVote to all other peers
  for (const peerId of Object.keys(state.nodes)) {
    if (peerId === candidateId) continue;
    if (isIsolated(state, candidateId) && !isIsolated(state, peerId)) continue;
    if (!isIsolated(state, candidateId) && isIsolated(state, peerId)) continue;

    const payload: RequestVotePayload = {
      term: node.currentTerm,
      candidateId,
      lastLogIndex,
      lastLogTerm,
      targetNodeId: peerId,
    };

    emittedEvents.push({
      id: `req-vote-${candidateId}-${peerId}-${node.currentTerm}`,
      tick: state.tick + 1,
      type: 'RAFT_REQUEST_VOTE',
      payload: (payload as unknown) as Record<string, unknown>,
    });
  }
}

function handleRequestVote(
  state: RaftClusterState,
  event: RaftSimEvent,
  emittedEvents: RaftSimEvent[],
): void {
  const p = event.payload as unknown as RequestVotePayload;
  const receiver = state.nodes[p.targetNodeId];
  if (!receiver || receiver.status !== 'ALIVE') return;

  if (p.term > receiver.currentTerm) {
    receiver.currentTerm = p.term;
    receiver.role = 'FOLLOWER';
    receiver.votedFor = null;
    receiver.votesReceived = [];
  }

  let voteGranted = false;
  const canVote = receiver.votedFor === null || receiver.votedFor === p.candidateId;

  const receiverLastLog = receiver.log[receiver.log.length - 1];
  const receiverLastTerm = receiverLastLog ? receiverLastLog.term : 0;
  const receiverLastIndex = receiverLastLog ? receiverLastLog.index : 0;

  const candidateLogUpToDate =
    p.lastLogTerm > receiverLastTerm ||
    (p.lastLogTerm === receiverLastTerm && p.lastLogIndex >= receiverLastIndex);

  if (p.term === receiver.currentTerm && canVote && candidateLogUpToDate) {
    voteGranted = true;
    receiver.votedFor = p.candidateId;
    receiver.currentElectionCountdown = receiver.electionTimeoutTicks; // Reset election timer
  }

  const reply: VoteReplyPayload = {
    term: receiver.currentTerm,
    voteGranted,
    fromNodeId: receiver.id,
    candidateId: p.candidateId,
  };

  emittedEvents.push({
    id: `vote-reply-${receiver.id}-${p.candidateId}-${receiver.currentTerm}`,
    tick: state.tick + 1,
    type: 'RAFT_VOTE_REPLY',
    payload: (reply as unknown) as Record<string, unknown>,
  });
}

function handleVoteReply(
  state: RaftClusterState,
  event: RaftSimEvent,
  emittedEvents: RaftSimEvent[],
): void {
  const p = event.payload as unknown as VoteReplyPayload;
  const candidate = state.nodes[p.candidateId];
  if (!candidate || candidate.status !== 'ALIVE') return;

  if (p.term > candidate.currentTerm) {
    candidate.currentTerm = p.term;
    candidate.role = 'FOLLOWER';
    candidate.votedFor = null;
    candidate.votesReceived = [];
    return;
  }

  if (candidate.role === 'CANDIDATE' && p.term === candidate.currentTerm && p.voteGranted) {
    if (!candidate.votesReceived.includes(p.fromNodeId)) {
      candidate.votesReceived.push(p.fromNodeId);
    }

    const majority = Math.floor(Object.keys(state.nodes).length / 2) + 1;
    if (candidate.votesReceived.length >= majority) {
      candidate.role = 'LEADER';
      candidate.leaderId = candidate.id;
      state.activeLeaderId = candidate.id;

      // Initialize leader volatile state
      candidate.nextIndex = {};
      candidate.matchIndex = {};
      const lastIndex = candidate.log.length > 0 ? candidate.log[candidate.log.length - 1]!.index : 0;

      for (const peerId of Object.keys(state.nodes)) {
        if (peerId !== candidate.id) {
          candidate.nextIndex[peerId] = lastIndex + 1;
          candidate.matchIndex[peerId] = 0;
        }
      }

      // Broadcast immediate heartbeat
      emittedEvents.push({
        id: `leader-elected-hb-${candidate.id}-${candidate.currentTerm}`,
        tick: state.tick + 1,
        type: 'RAFT_HEARTBEAT',
        payload: { leaderId: candidate.id },
      });
    }
  }
}

function handleHeartbeat(
  state: RaftClusterState,
  event: RaftSimEvent,
  emittedEvents: RaftSimEvent[],
): void {
  const leaderId = String(event.payload['leaderId'] ?? '');
  const leader = state.nodes[leaderId];
  if (!leader || leader.status !== 'ALIVE' || leader.role !== 'LEADER') return;

  for (const peerId of Object.keys(state.nodes)) {
    if (peerId === leaderId) continue;
    if (isIsolated(state, leaderId) && !isIsolated(state, peerId)) continue;
    if (!isIsolated(state, leaderId) && isIsolated(state, peerId)) continue;

    const prevIndex = leader.nextIndex?.[peerId] ? leader.nextIndex[peerId]! - 1 : 0;
    const prevLog = prevIndex > 0 ? leader.log[prevIndex - 1] : undefined;
    const prevTerm = prevLog ? prevLog.term : 0;

    const entriesToSend = leader.log.slice(prevIndex);

    const payload: AppendEntriesPayload = {
      term: leader.currentTerm,
      leaderId: leader.id,
      prevLogIndex: prevIndex,
      prevLogTerm: prevTerm,
      entries: entriesToSend,
      leaderCommit: leader.commitIndex,
      targetNodeId: peerId,
    };

    emittedEvents.push({
      id: `append-${leader.id}-${peerId}-${state.tick}`,
      tick: state.tick + 1,
      type: 'RAFT_APPEND_ENTRIES',
      payload: (payload as unknown) as Record<string, unknown>,
    });
  }
}

function handleAppendEntries(
  state: RaftClusterState,
  event: RaftSimEvent,
  emittedEvents: RaftSimEvent[],
): void {
  const p = event.payload as unknown as AppendEntriesPayload;
  const follower = state.nodes[p.targetNodeId];
  if (!follower || follower.status !== 'ALIVE') return;

  if (p.term > follower.currentTerm) {
    follower.currentTerm = p.term;
    follower.role = 'FOLLOWER';
    follower.votedFor = null;
  }

  let success = false;
  let matchIndex = 0;

  if (p.term === follower.currentTerm) {
    follower.role = 'FOLLOWER';
    follower.leaderId = p.leaderId;
    follower.currentElectionCountdown = follower.electionTimeoutTicks; // Reset timer

    const prevIndexValid =
      p.prevLogIndex === 0 ||
      (follower.log.length >= p.prevLogIndex &&
        follower.log[p.prevLogIndex - 1]?.term === p.prevLogTerm);

    if (prevIndexValid) {
      success = true;
      // Truncate conflicts and append new entries
      follower.log = follower.log.slice(0, p.prevLogIndex);
      follower.log.push(...p.entries);
      matchIndex = follower.log.length;

      if (p.leaderCommit > follower.commitIndex) {
        follower.commitIndex = Math.min(p.leaderCommit, follower.log.length);
      }
    }
  }

  const reply: AppendReplyPayload = {
    term: follower.currentTerm,
    success,
    matchIndex,
    fromNodeId: follower.id,
    leaderId: p.leaderId,
  };

  emittedEvents.push({
    id: `append-reply-${follower.id}-${p.leaderId}-${state.tick}`,
    tick: state.tick + 1,
    type: 'RAFT_APPEND_REPLY',
    payload: (reply as unknown) as Record<string, unknown>,
  });
}

function handleAppendReply(state: RaftClusterState, event: RaftSimEvent): void {
  const p = event.payload as unknown as AppendReplyPayload;
  const leader = state.nodes[p.leaderId];
  if (!leader || leader.status !== 'ALIVE' || leader.role !== 'LEADER') return;

  if (p.term > leader.currentTerm) {
    leader.currentTerm = p.term;
    leader.role = 'FOLLOWER';
    leader.votedFor = null;
    return;
  }

  if (p.success && leader.matchIndex && leader.nextIndex) {
    leader.matchIndex[p.fromNodeId] = p.matchIndex;
    leader.nextIndex[p.fromNodeId] = p.matchIndex + 1;

    // Advance leader commitIndex if majority of matchIndex >= N
    const totalNodes = Object.keys(state.nodes).length;
    const majority = Math.floor(totalNodes / 2) + 1;

    for (let N = leader.log.length; N > leader.commitIndex; N--) {
      const entry = leader.log[N - 1];
      if (entry && entry.term === leader.currentTerm) {
        let count = 1; // leader itself
        for (const peerId of Object.keys(state.nodes)) {
          if (peerId !== leader.id && (leader.matchIndex[peerId] ?? 0) >= N) {
            count++;
          }
        }
        if (count >= majority) {
          leader.commitIndex = N;
          break;
        }
      }
    }
  } else if (!p.success && leader.nextIndex) {
    // Decrement nextIndex on failure and retry
    const currentNext = leader.nextIndex[p.fromNodeId] ?? 1;
    if (currentNext > 1) {
      leader.nextIndex[p.fromNodeId] = currentNext - 1;
    }
  }
}

function handleClientPropose(
  state: RaftClusterState,
  event: RaftSimEvent,
  emittedEvents: RaftSimEvent[],
): void {
  const leaderId = state.activeLeaderId;
  if (!leaderId) return;
  const leader = state.nodes[leaderId];
  if (!leader || leader.status !== 'ALIVE' || leader.role !== 'LEADER') return;

  const command = String(event.payload['command'] ?? 'OP_SET');
  const clientRequestId = event.payload['clientRequestId'] as string | undefined;

  const newIndex = leader.log.length + 1;
  const entry: RaftLogEntry = {
    term: leader.currentTerm,
    index: newIndex,
    command,
    clientRequestId,
  };

  leader.log.push(entry);

  // Trigger replication
  emittedEvents.push({
    id: `propose-rep-${leader.id}-${newIndex}`,
    tick: state.tick + 1,
    type: 'RAFT_HEARTBEAT',
    payload: { leaderId: leader.id },
  });
}

function handleNodeCrash(state: RaftClusterState, event: RaftSimEvent): void {
  const nodeId = String(event.payload['nodeId'] ?? '');
  const node = state.nodes[nodeId];
  if (node) {
    node.status = 'CRASHED';
    if (state.activeLeaderId === nodeId) {
      state.activeLeaderId = null;
    }
  }
}

function handleNodeRecover(state: RaftClusterState, event: RaftSimEvent): void {
  const nodeId = String(event.payload['nodeId'] ?? '');
  const node = state.nodes[nodeId];
  if (node) {
    node.status = 'ALIVE';
    node.role = 'FOLLOWER';
    node.currentElectionCountdown = node.electionTimeoutTicks;
  }
}

function handleNetworkPartition(state: RaftClusterState, event: RaftSimEvent): void {
  const isolatedIds = (event.payload['isolatedNodeIds'] as string[] | undefined) ?? [];
  state.isolatedNodeIds = isolatedIds;
}

function handleNetworkHeal(state: RaftClusterState): void {
  state.isolatedNodeIds = [];
}
