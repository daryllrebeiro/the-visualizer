import { describe, expect, it } from 'vitest';
import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import {
  createDefaultRaftCluster,
  pureRaftTransition,
} from './raft-state-transitions.js';
import type { RaftSimEvent } from './raft-types.js';

describe('Raft Consensus Domain Fidelity Test Suite (Ongaro & Ousterhout 2014 & etcd/raft)', () => {
  describe('Pre-Vote Protocol Extension (etcd/raft & §9.6)', () => {
    it('initiates PreVote without incrementing term to prevent disruptive partition elections', () => {
      const rng = new DeterministicRNG(42);
      const cluster = createDefaultRaftCluster('raft-cluster-1', 5, 42);

      // Enable Pre-Vote
      const cfg: RaftSimEvent = {
        id: 'cfg-prevote',
        tick: 1,
        type: 'RAFT_CONFIGURE_FIDELITY',
        payload: { preVoteEnabled: true, fidelityMode: 'REALISTIC' },
      };
      let state = pureRaftTransition(cluster, cfg, rng).nextState;
      expect(state.preVoteEnabled).toBe(true);

      // Trigger election timeout on Node 1
      const timeoutEv: RaftSimEvent = {
        id: 'timeout-1',
        tick: 2,
        type: 'RAFT_ELECTION_TIMEOUT',
        payload: { candidateId: '1' },
      };

      const res = pureRaftTransition(state, timeoutEv, rng);
      const node1 = res.nextState.nodes['1']!;

      // In PreVote: role becomes PRE_CANDIDATE and term remains unchanged (0)
      expect(node1.role).toBe('PRE_CANDIDATE');
      expect(node1.currentTerm).toBe(0);

      // Emitted events should be RAFT_PRE_VOTE_REQUEST, NOT RAFT_REQUEST_VOTE
      const preVoteRequests = res.emittedEvents.filter((e) => e.type === 'RAFT_PRE_VOTE_REQUEST');
      expect(preVoteRequests.length).toBe(4); // 4 peers
      const officialRequests = res.emittedEvents.filter((e) => e.type === 'RAFT_REQUEST_VOTE');
      expect(officialRequests.length).toBe(0);
    });

    it('promotes PRE_CANDIDATE to full CANDIDATE and increments term once quorum grants pre-vote', () => {
      const rng = new DeterministicRNG(42);
      let state = createDefaultRaftCluster('raft-cluster-1', 5, 42);
      state.preVoteEnabled = true;
      state.nodes['1']!.role = 'PRE_CANDIDATE';
      state.nodes['1']!.currentTerm = 2;
      state.nodes['1']!.preVotesReceived = ['1'];

      // Peer 2 grants pre-vote
      const reply2: RaftSimEvent = {
        id: 'pv-reply-2',
        tick: 5,
        type: 'RAFT_PRE_VOTE_REPLY',
        payload: { candidateId: '1', fromNodeId: '2', term: 3, voteGranted: true },
      };
      state = pureRaftTransition(state, reply2, rng).nextState;
      expect(state.nodes['1']!.role).toBe('PRE_CANDIDATE'); // 2 votes < quorum (3)

      // Peer 3 grants pre-vote -> quorum reached (3 out of 5)
      const reply3: RaftSimEvent = {
        id: 'pv-reply-3',
        tick: 6,
        type: 'RAFT_PRE_VOTE_REPLY',
        payload: { candidateId: '1', fromNodeId: '3', term: 3, voteGranted: true },
      };
      const res3 = pureRaftTransition(state, reply3, rng);
      const node1 = res3.nextState.nodes['1']!;

      expect(node1.role).toBe('CANDIDATE');
      expect(node1.currentTerm).toBe(3); // Incremented!
      expect(res3.emittedEvents.some((e) => e.type === 'RAFT_REQUEST_VOTE')).toBe(true);
    });
  });

  describe('Log Compaction via InstallSnapshot RPC', () => {
    it('truncates follower log up to snapshotIndex when snapshot is installed', () => {
      const rng = new DeterministicRNG(42);
      let state = createDefaultRaftCluster(3, 42);

      // Follower 2 has stale log entries [index 1, 2, 3]
      const follower = state.nodes['2']!;
      follower.log = [
        { term: 1, index: 1, command: 'cmd1' },
        { term: 1, index: 2, command: 'cmd2' },
        { term: 1, index: 3, command: 'cmd3' },
      ];

      // Leader 1 sends InstallSnapshot covering up to index 10, term 2
      const installSnapshotEv: RaftSimEvent = {
        id: 'snap-1',
        tick: 10,
        type: 'RAFT_INSTALL_SNAPSHOT',
        payload: {
          term: 2,
          leaderId: '1',
          lastIncludedIndex: 10,
          lastIncludedTerm: 2,
          targetNodeId: '2',
        },
      };

      const result = pureRaftTransition(state, installSnapshotEv, rng);
      const updatedFollower = result.nextState.nodes['2']!;

      expect(updatedFollower.snapshotIndex).toBe(10);
      expect(updatedFollower.snapshotTerm).toBe(2);
      expect(updatedFollower.commitIndex).toBe(10);
      expect(updatedFollower.lastApplied).toBe(10);
      // Older entries are discarded
      expect(updatedFollower.log.length).toBe(0);
    });
  });

  describe('Linearizable ReadIndex Query Handling', () => {
    it('responds to linearizable read query from active leader with current commitIndex', () => {
      const rng = new DeterministicRNG(42);
      let state = createDefaultRaftCluster(3, 42);
      state.nodes['1']!.role = 'LEADER';
      state.nodes['1']!.commitIndex = 42;
      state.activeLeaderId = '1';

      const readEv: RaftSimEvent = {
        id: 'read-1',
        tick: 15,
        type: 'RAFT_LINEARIZABLE_READ',
        payload: { leaderId: '1' },
      };

      const res = pureRaftTransition(state, readEv, rng);
      const resp = res.emittedEvents.find((e) => e.type === 'RAFT_CLIENT_PROPOSE');
      expect(resp).toBeDefined();
      expect(resp?.payload['linearizable']).toBe(true);
      expect(resp?.payload['readIndex']).toBe(42);
    });
  });
});
