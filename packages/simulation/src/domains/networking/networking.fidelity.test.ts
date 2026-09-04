import { describe, expect, it } from 'vitest';
import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import {
  advanceCongestionWindow,
  computeCubicTarget,
  createInitialCongestionState,
  updateRttAndRto,
} from './congestion-control.js';
import {
  createDefaultNetworkingCluster,
  pureNetworkingTransition,
} from './networking-state-transitions.js';
import type { NetworkSimEvent } from './networking-types.js';

describe('TCP Networking Domain Fidelity Test Suite', () => {
  describe('Linux Kernel CUBIC vs Reno Congestion Control (Ha et al. 2008 & RFC 5681)', () => {
    it('models CUBIC cubic growth curve with concave and convex inflection points', () => {
      const wMax = 16;
      // C = 0.4, beta = 0.3
      // K = cbrt(16 * 0.3 / 0.4) = cbrt(12) ≈ 2.289 RTT rounds
      const K = Math.cbrt((16 * 0.3) / 0.4);

      // At t = 0 (immediately after loss): window is below wMax
      const w0 = computeCubicTarget(wMax, 0);
      expect(w0).toBeLessThan(wMax);

      // At t = K (inflection point): target equals wMax
      const wK = computeCubicTarget(wMax, K);
      expect(Math.abs(wK - wMax)).toBeLessThanOrEqual(0.05);

      // At t < K (concave region): growth rate slows as it nears wMax
      const wMid = computeCubicTarget(wMax, K / 2);
      expect(wMid).toBeGreaterThan(w0);
      expect(wMid).toBeLessThan(wMax);

      // At t > K (convex region): growth accelerates beyond wMax to probe bandwidth
      const wAfter = computeCubicTarget(wMax, K + 2);
      expect(wAfter).toBeGreaterThan(wMax);
    });

    it('demonstrates Reno linear additive increase (+1/cwnd) vs CUBIC curve', () => {
      const reno = createInitialCongestionState('RENO');
      reno.phase = 'CongestionAvoidance';
      reno.cwnd = 10;

      // Single ACK in Reno CA: adds 1/floor(cwnd) = 0.1
      advanceCongestionWindow(reno, 1, 'ACK_RECEIVED');
      expect(reno.cwnd).toBeCloseTo(10.1, 2);

      const cubic = createInitialCongestionState('CUBIC');
      cubic.phase = 'CongestionAvoidance';
      cubic.cwnd = 10;
      cubic.wMax = 16;
      cubic.lastLossTick = 0;
      cubic.rttTicks = 2;

      advanceCongestionWindow(cubic, 10, 'ACK_RECEIVED');
      expect(cubic.cwnd).toBeGreaterThan(10);
    });
  });

  describe('RFC 6298 Retransmission Timer (SRTT, RTTVAR, RTO Calculation)', () => {
    it('updates smoothed RTT and variance per RFC 6298 formulas', () => {
      const congestion = createInitialCongestionState();
      // Reset to 0 for clean initialization
      congestion.srttTicks = 0;
      congestion.rttvarTicks = 0;

      // First measurement: R' = 10 ticks
      updateRttAndRto(congestion, 10);
      expect(congestion.srttTicks).toBe(10);
      expect(congestion.rttvarTicks).toBe(5);
      // RTO = 10 + max(1, 4 * 5) = 30
      expect(congestion.rtoTicks).toBe(30);

      // Second measurement: R' = 12 ticks
      // RTTVAR = 0.75 * 5 + 0.25 * |10 - 12| = 3.75 + 0.5 = 4.25
      // SRTT = 0.875 * 10 + 0.125 * 12 = 8.75 + 1.5 = 10.25
      // RTO = 10.25 + 4 * 4.25 = 10.25 + 17 = 27.25
      updateRttAndRto(congestion, 12);
      expect(congestion.srttTicks).toBe(10.25);
      expect(congestion.rttvarTicks).toBe(4.25);
      expect(congestion.rtoTicks).toBe(27.25);
    });
  });

  describe('RFC 5681 Fast Retransmit / Fast Recovery on Triple Duplicate ACK', () => {
    it('triggers fast retransmit on 3 duplicate ACKs without waiting for RTO timeout', () => {
      const rng = new DeterministicRNG(42);
      let state = createDefaultNetworkingCluster();

      // Complete handshake
      state = pureNetworkingTransition(state, { id: 'e1', tick: 1, type: 'TCP_START_HANDSHAKE', payload: {} }, rng).nextState;
      state = pureNetworkingTransition(state, { id: 'e2', tick: 2, type: 'TCP_TICK', payload: {} }, rng).nextState;
      state = pureNetworkingTransition(state, { id: 'e3', tick: 3, type: 'TCP_TICK', payload: {} }, rng).nextState;
      state = pureNetworkingTransition(state, { id: 'e4', tick: 4, type: 'TCP_TICK', payload: {} }, rng).nextState;

      expect(state.clientState).toBe('ESTABLISHED');
      expect(state.serverState).toBe('ESTABLISHED');

      // Send packet 1001 and deliver
      state = pureNetworkingTransition(state, { id: 'e5', tick: 5, type: 'TCP_SEND_DATA', payload: {} }, rng).nextState;
      state = pureNetworkingTransition(state, { id: 'e6', tick: 6, type: 'TCP_TICK', payload: {} }, rng).nextState;

      expect(state.serverAckNumber).toBe(1101);

      // Now deliver an out-of-order packet (seq 1301) 3 times to trigger 3 dup ACKs
      state.inFlightPackets.push({
        id: 'ooo-1',
        source: 'CLIENT',
        destination: 'SERVER',
        seqNumber: 1301,
        ackNumber: 1000,
        flags: ['DATA'],
        windowSize: 4,
        payloadLength: 100,
        payload: 'ooo_data',
        sentAtTick: 7,
        state: 'InFlight',
      });
      state = pureNetworkingTransition(state, { id: 'e7', tick: 8, type: 'TCP_TICK', payload: {} }, rng).nextState;

      state.inFlightPackets.push({
        id: 'ooo-2',
        source: 'CLIENT',
        destination: 'SERVER',
        seqNumber: 1301,
        ackNumber: 1000,
        flags: ['DATA'],
        windowSize: 4,
        payloadLength: 100,
        payload: 'ooo_data',
        sentAtTick: 8,
        state: 'InFlight',
      });
      state = pureNetworkingTransition(state, { id: 'e8', tick: 9, type: 'TCP_TICK', payload: {} }, rng).nextState;

      state.inFlightPackets.push({
        id: 'ooo-3',
        source: 'CLIENT',
        destination: 'SERVER',
        seqNumber: 1301,
        ackNumber: 1000,
        flags: ['DATA'],
        windowSize: 4,
        payloadLength: 100,
        payload: 'ooo_data',
        sentAtTick: 9,
        state: 'InFlight',
      });
      state = pureNetworkingTransition(state, { id: 'e9', tick: 10, type: 'TCP_TICK', payload: {} }, rng).nextState;

      // 3 duplicate ACKs recorded
      expect(state.congestion.duplicateAckCount).toBe(3);
      expect(state.totalFastRetransmissions).toBe(1);
      expect(state.congestion.phase).toBe('FastRecovery');
      expect(state.congestion.fastRecovery).toBe(true);
    });
  });

  describe('RFC 7323 Window Scaling & RFC 2018 SACK Block Negotiation', () => {
    it('applies window scale shift factor to expand effective receive window', () => {
      const rng = new DeterministicRNG(42);
      const state = createDefaultNetworkingCluster();

      // Configure window scaling shift = 7 (multiplies window by 128)
      const ev: NetworkSimEvent = {
        id: 'cfg',
        tick: 1,
        type: 'TCP_CONFIGURE_FIDELITY',
        payload: {
          fidelityMode: 'REALISTIC',
          windowScaleShift: 7,
          sackEnabled: true,
        },
      };

      const result = pureNetworkingTransition(state, ev, rng).nextState;
      expect(result.windowScaleShift).toBe(7);
      expect(result.effectiveWindowSize).toBe(4 << 7); // 4 * 128 = 512
      expect(result.sackEnabled).toBe(true);
    });
  });
});
