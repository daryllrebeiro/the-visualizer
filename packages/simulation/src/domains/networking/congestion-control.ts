import type { CongestionControlState, TCPSlidingWindowSlot } from './networking-types.js';

export function createInitialSlidingWindow(startSeq = 1001, count = 12): TCPSlidingWindowSlot[] {
  const slots: TCPSlidingWindowSlot[] = [];
  for (let i = 0; i < count; i++) {
    slots.push({
      seqNumber: startSeq + i * 100,
      payload: `pkt_data_${String(i + 1)}`,
      state: i < 4 ? 'UsableNotSent' : 'NotUsable',
      sentTick: null,
    });
  }
  return slots;
}

export function createInitialCongestionState(): CongestionControlState {
  return {
    cwnd: 1,
    ssthresh: 8,
    phase: 'SlowStart',
    rttTicks: 2,
    duplicateAckCount: 0,
    history: [{ tick: 0, cwnd: 1, phase: 'SlowStart' }],
  };
}

export function advanceCongestionWindow(congestion: CongestionControlState, tick: number, event: 'ACK_RECEIVED' | 'PACKET_LOSS'): void {
  if (event === 'PACKET_LOSS') {
    congestion.ssthresh = Math.max(2, Math.floor(congestion.cwnd / 2));
    congestion.cwnd = 1;
    congestion.phase = 'SlowStart';
  } else if (event === 'ACK_RECEIVED') {
    if (congestion.phase === 'SlowStart') {
      congestion.cwnd += 1; // Exponential growth per RTT round
      if (congestion.cwnd >= congestion.ssthresh) {
        congestion.phase = 'CongestionAvoidance';
      }
    } else if (congestion.phase === 'CongestionAvoidance') {
      congestion.cwnd += Number((1 / Math.floor(congestion.cwnd)).toFixed(2)); // Linear additive increase
    }
  }

  congestion.history.push({
    tick,
    cwnd: Number(congestion.cwnd.toFixed(2)),
    phase: congestion.phase,
  });
}
