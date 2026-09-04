import { describe, expect, it } from 'vitest';

import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import { NetworkInvariantChecker } from './networking-invariants.js';
import {
  createDefaultNetworkingCluster,
  pureNetworkingTransition,
} from './networking-state-transitions.js';
import type { NetworkSimEvent } from './networking-types.js';

describe('Networking Fundamentals Domain Simulation (TCP Handshake & Congestion Control)', () => {
  it('should complete full 3-way handshake from CLOSED to ESTABLISHED', () => {
    const rng = new DeterministicRNG(42);
    let state = createDefaultNetworkingCluster();

    // 1. Client sends SYN
    const synEv: NetworkSimEvent = {
      id: 'syn-1',
      tick: 1,
      type: 'TCP_START_HANDSHAKE',
      payload: {},
    };
    state = pureNetworkingTransition(state, synEv, rng).nextState;
    expect(state.clientState).toBe('SYN_SENT');
    expect(state.inFlightPackets.length).toBe(1);

    // 2. Tick -> Server receives SYN and responds SYN-ACK
    const tickEv1: NetworkSimEvent = { id: 'tick-1', tick: 2, type: 'TCP_TICK', payload: {} };
    state = pureNetworkingTransition(state, tickEv1, rng).nextState;
    expect(state.serverState).toBe('SYN_RECEIVED');
    expect(state.inFlightPackets[0]?.flags).toContain('SYN-ACK');

    // 3. Tick -> Client receives SYN-ACK, transitions to ESTABLISHED, replies with ACK
    const tickEv2: NetworkSimEvent = { id: 'tick-2', tick: 3, type: 'TCP_TICK', payload: {} };
    state = pureNetworkingTransition(state, tickEv2, rng).nextState;
    expect(state.clientState).toBe('ESTABLISHED');
    expect(state.inFlightPackets[0]?.flags).toContain('ACK');

    // 4. Tick -> Server receives ACK, transitions to ESTABLISHED
    const tickEv3: NetworkSimEvent = { id: 'tick-3', tick: 4, type: 'TCP_TICK', payload: {} };
    state = pureNetworkingTransition(state, tickEv3, rng).nextState;
    expect(state.serverState).toBe('ESTABLISHED');
  });

  it('should adjust congestion window on packet loss (AIMD)', () => {
    const rng = new DeterministicRNG(42);
    let state = createDefaultNetworkingCluster();
    state.clientState = 'ESTABLISHED';
    state.serverState = 'ESTABLISHED';
    state.congestion.cwnd = 8;
    state.congestion.ssthresh = 8;
    state.congestion.phase = 'CongestionAvoidance';

    // Send data packet
    const sendEv: NetworkSimEvent = { id: 'send-1', tick: 5, type: 'TCP_SEND_DATA', payload: {} };
    state = pureNetworkingTransition(state, sendEv, rng).nextState;
    expect(state.inFlightPackets.length).toBe(1);

    // Drop packet
    const dropEv: NetworkSimEvent = { id: 'drop-1', tick: 6, type: 'TCP_DROP_PACKET', payload: {} };
    state = pureNetworkingTransition(state, dropEv, rng).nextState;

    expect(state.totalPacketsDropped).toBe(1);
    expect(state.congestion.cwnd).toBe(1);
    expect(state.congestion.ssthresh).toBe(4); // Halved from 8
    expect(state.congestion.phase).toBe('SlowStart');
  });

  it('should validate invariants cleanly', () => {
    const state = createDefaultNetworkingCluster();
    const checker = new NetworkInvariantChecker();
    expect(checker.check(state)).toBeUndefined();
  });
});
