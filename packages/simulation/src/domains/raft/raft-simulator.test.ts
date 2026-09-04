import { describe, expect, it } from 'vitest';

import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import { RaftInvariantChecker } from './raft-invariants.js';
import { createDefaultRaftCluster, pureRaftTransition } from './raft-state-transitions.js';
import type { RaftSimEvent } from './raft-types.js';

describe('Raft Consensus Simulation Engine', () => {
  it('should initialize a 5-node cluster with randomized election countdowns', () => {
    const cluster = createDefaultRaftCluster('raft-test', 5, 100);
    expect(Object.keys(cluster.nodes).length).toBe(5);
    expect(cluster.activeLeaderId).toBeNull();
    expect(cluster.highestTerm).toBe(0);

    for (const node of Object.values(cluster.nodes)) {
      expect(node.role).toBe('FOLLOWER');
      expect(node.currentElectionCountdown).toBeGreaterThan(0);
      expect(node.currentTerm).toBe(0);
    }
  });

  it('should elect a leader when candidate achieves majority votes', () => {
    const rng = new DeterministicRNG(42);
    const cluster = createDefaultRaftCluster('raft-test', 5, 42);
    const checker = new RaftInvariantChecker();

    // Trigger election timeout on Node 1
    const timeoutEvent: RaftSimEvent = {
      id: 'e-timeout-1',
      tick: 1,
      type: 'RAFT_ELECTION_TIMEOUT',
      payload: { candidateId: '1' },
    };

    let result = pureRaftTransition(cluster, timeoutEvent, rng);
    expect(result.nextState.nodes['1']?.role).toBe('CANDIDATE');
    expect(result.nextState.nodes['1']?.currentTerm).toBe(1);
    expect(result.emittedEvents.length).toBe(4); // RequestVote to nodes 2, 3, 4, 5

    // Feed RequestVote to Node 2
    const reqVoteEvent = result.emittedEvents[0]!;
    result = pureRaftTransition(result.nextState, reqVoteEvent, rng);
    expect(result.emittedEvents.length).toBe(1); // VoteReply

    // Feed VoteReply from Node 2 to Candidate Node 1
    const voteReplyEvent = result.emittedEvents[0]!;
    result = pureRaftTransition(result.nextState, voteReplyEvent, rng);
    expect(result.nextState.nodes['1']?.votesReceived).toContain('2');

    // Feed RequestVote to Node 3
    const reqVote3: RaftSimEvent = {
      id: 'req-vote-3',
      tick: 2,
      type: 'RAFT_REQUEST_VOTE',
      payload: {
        term: 1,
        candidateId: '1',
        lastLogIndex: 0,
        lastLogTerm: 0,
        targetNodeId: '3',
      },
    };
    result = pureRaftTransition(result.nextState, reqVote3, rng);
    const voteReply3 = result.emittedEvents[0]!;

    // Feed 3rd vote (achieving 3/5 majority: Node 1 self-vote + Node 2 + Node 3)
    result = pureRaftTransition(result.nextState, voteReply3, rng);
    expect(result.nextState.nodes['1']?.role).toBe('LEADER');
    expect(result.nextState.activeLeaderId).toBe('1');

    // Verify invariants pass
    expect(checker.check(result.nextState)).toBeUndefined();
  });

  it('should replicate client command to followers and advance commitIndex on majority ACK', () => {
    const rng = new DeterministicRNG(42);
    let state = createDefaultRaftCluster('raft-test', 3, 42);
    const checker = new RaftInvariantChecker();

    // Manually set node 1 as leader for term 1
    state.nodes['1']!.role = 'LEADER';
    state.nodes['1']!.currentTerm = 1;
    state.nodes['1']!.nextIndex = { '2': 1, '3': 1 };
    state.nodes['1']!.matchIndex = { '2': 0, '3': 0 };
    state.activeLeaderId = '1';
    state.nodes['2']!.currentTerm = 1;
    state.nodes['3']!.currentTerm = 1;

    // Propose client write
    const proposeEvent: RaftSimEvent = {
      id: 'prop-1',
      tick: 10,
      type: 'RAFT_CLIENT_PROPOSE',
      payload: { command: 'SET x = 100' },
    };

    let res = pureRaftTransition(state, proposeEvent, rng);
    expect(res.nextState.nodes['1']?.log.length).toBe(1);
    expect(res.nextState.nodes['1']?.commitIndex).toBe(0); // Not committed yet

    // Broadcast heartbeat / append entries
    const hbEvent: RaftSimEvent = {
      id: 'hb-1',
      tick: 11,
      type: 'RAFT_HEARTBEAT',
      payload: { leaderId: '1' },
    };
    res = pureRaftTransition(res.nextState, hbEvent, rng);

    // Follower 2 processes AppendEntries
    const append2 = res.emittedEvents.find((e) => (e.payload as any).targetNodeId === '2');
    expect(append2).toBeDefined();

    res = pureRaftTransition(res.nextState, append2!, rng);
    expect(res.nextState.nodes['2']?.log.length).toBe(1);
    expect(res.emittedEvents.length).toBe(1); // AppendReply

    // Leader processes AppendReply from Follower 2
    const reply2 = res.emittedEvents[0]!;
    res = pureRaftTransition(res.nextState, reply2, rng);

    // Majority (Leader 1 + Follower 2 out of 3) reached -> commitIndex advances!
    expect(res.nextState.nodes['1']?.commitIndex).toBe(1);

    // Invariants check
    expect(checker.check(res.nextState)).toBeUndefined();
  });

  it('should isolate partitioned minority and prevent writes from committing', () => {
    const rng = new DeterministicRNG(42);
    let state = createDefaultRaftCluster('raft-test', 5, 42);

    // Set Node 1 as leader
    state.nodes['1']!.role = 'LEADER';
    state.nodes['1']!.currentTerm = 1;
    state.activeLeaderId = '1';

    // Isolate minority {1, 2}
    const partitionEvent: RaftSimEvent = {
      id: 'part-1',
      tick: 20,
      type: 'RAFT_NETWORK_PARTITION',
      payload: { isolatedNodeIds: ['1', '2'] },
    };
    let res = pureRaftTransition(state, partitionEvent, rng);
    expect(res.nextState.isolatedNodeIds).toEqual(['1', '2']);

    // Propose write to isolated leader
    const writeEvent: RaftSimEvent = {
      id: 'prop-isolated',
      tick: 21,
      type: 'RAFT_CLIENT_PROPOSE',
      payload: { command: 'SET isolated_val = 50' },
    };
    res = pureRaftTransition(res.nextState, writeEvent, rng);
    expect(res.nextState.nodes['1']?.log.length).toBe(1);

    // Heartbeats cannot reach majority nodes {3, 4, 5}
    const hbRes = pureRaftTransition(
      res.nextState,
      { id: 'hb-part', tick: 22, type: 'RAFT_HEARTBEAT', payload: { leaderId: '1' } },
      rng,
    );
    const targetNodes = hbRes.emittedEvents.map((e) => (e.payload as any).targetNodeId);
    expect(targetNodes).not.toContain('3');
    expect(targetNodes).not.toContain('4');
    expect(targetNodes).not.toContain('5');

    // Heal network
    const healRes = pureRaftTransition(
      res.nextState,
      { id: 'heal-1', tick: 30, type: 'RAFT_NETWORK_HEAL', payload: {} },
      rng,
    );
    expect(healRes.nextState.isolatedNodeIds.length).toBe(0);
  });
});
