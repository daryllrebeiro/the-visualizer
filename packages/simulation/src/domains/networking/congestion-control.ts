import type {
  CongestionControlState,
  TCPCongestionAlgorithm,
  TCPSlidingWindowSlot,
} from './networking-types.js';

export function createInitialSlidingWindow(startSeq = 1001, count = 12): TCPSlidingWindowSlot[] {
  const slots: TCPSlidingWindowSlot[] = [];
  for (let i = 0; i < count; i++) {
    slots.push({
      seqNumber: startSeq + i * 100,
      payload: `pkt_data_${String(i + 1)}`,
      state: i < 4 ? 'UsableNotSent' : 'NotUsable',
      sentTick: null,
      isSacked: false,
    });
  }
  return slots;
}

export function createInitialCongestionState(
  algorithm: TCPCongestionAlgorithm = 'CUBIC',
): CongestionControlState {
  const srtt = 2;
  const rttvar = 1;
  const rto = srtt + Math.max(1, 4 * rttvar);

  return {
    algorithm,
    cwnd: 1,
    ssthresh: 8,
    phase: 'SlowStart',
    rttTicks: srtt,
    duplicateAckCount: 0,
    lastLossTick: 0,
    wMax: 8,
    k: 0,
    srttTicks: srtt,
    rttvarTicks: rttvar,
    rtoTicks: rto,
    fastRecovery: false,
    history: [{ tick: 0, cwnd: 1, phase: 'SlowStart' }],
  };
}

/**
 * RFC 6298: Computing TCP's Retransmission Timer
 * SRTT <- (1 - alpha) * SRTT + alpha * R' (alpha = 1/8)
 * RTTVAR <- (1 - beta) * RTTVAR + beta * |SRTT - R'| (beta = 1/4)
 * RTO = SRTT + max(G, K * RTTVAR) (K = 4, G = 1 tick)
 */
export function updateRttAndRto(
  congestion: CongestionControlState,
  measuredRttTicks: number,
): void {
  const alpha = 0.125; // 1/8
  const beta = 0.25; // 1/4
  const K = 4;
  const G = 1;

  if (congestion.srttTicks <= 0) {
    congestion.srttTicks = measuredRttTicks;
    congestion.rttvarTicks = measuredRttTicks / 2;
  } else {
    congestion.rttvarTicks =
      (1 - beta) * congestion.rttvarTicks +
      beta * Math.abs(congestion.srttTicks - measuredRttTicks);
    congestion.srttTicks = (1 - alpha) * congestion.srttTicks + alpha * measuredRttTicks;
  }

  congestion.rtoTicks = Number(
    (congestion.srttTicks + Math.max(G, K * congestion.rttvarTicks)).toFixed(2),
  );
  congestion.rttTicks = Number(congestion.srttTicks.toFixed(2));
}

/**
 * Computes CUBIC window target at elapsed time t (in RTT rounds since last congestion event):
 * W_cubic(t) = C * (t - K)^3 + W_max
 * where K = cbrt(W_max * beta / C), C = 0.4, beta = 0.3
 */
export function computeCubicTarget(wMax: number, elapsedRtts: number): number {
  const C = 0.4;
  const beta = 0.3; // 1 - 0.7 decrease factor
  const K = Math.cbrt((wMax * beta) / C);
  const diff = elapsedRtts - K;
  const wCubic = C * Math.pow(diff, 3) + wMax;
  return Math.max(1, Number(wCubic.toFixed(2)));
}

export function advanceCongestionWindow(
  congestion: CongestionControlState,
  tick: number,
  event: 'ACK_RECEIVED' | 'PACKET_LOSS' | 'TRIPLE_DUP_ACK',
): void {
  if (event === 'PACKET_LOSS') {
    // Timeout-based loss
    congestion.wMax = Math.max(2, congestion.cwnd);
    if (congestion.algorithm === 'CUBIC') {
      congestion.ssthresh = Math.max(2, Math.floor(congestion.cwnd * 0.7));
      const C = 0.4;
      const beta = 0.3;
      congestion.k = Number(Math.cbrt((congestion.wMax * beta) / C).toFixed(2));
    } else {
      congestion.ssthresh = Math.max(2, Math.floor(congestion.cwnd / 2));
    }

    congestion.cwnd = 1;
    congestion.phase = 'SlowStart';
    congestion.fastRecovery = false;
    congestion.duplicateAckCount = 0;
    congestion.lastLossTick = tick;
  } else if (event === 'TRIPLE_DUP_ACK') {
    // Fast Retransmit / Fast Recovery (RFC 5681)
    congestion.wMax = Math.max(2, congestion.cwnd);
    if (congestion.algorithm === 'CUBIC') {
      congestion.ssthresh = Math.max(2, Math.floor(congestion.cwnd * 0.7));
      const C = 0.4;
      const beta = 0.3;
      congestion.k = Number(Math.cbrt((congestion.wMax * beta) / C).toFixed(2));
    } else {
      congestion.ssthresh = Math.max(2, Math.floor(congestion.cwnd / 2));
    }

    congestion.cwnd = congestion.ssthresh + 3; // Inflate by 3 duplicate ACKs
    congestion.phase = 'FastRecovery';
    congestion.fastRecovery = true;
    congestion.lastLossTick = tick;
  } else if (event === 'ACK_RECEIVED') {
    if (congestion.fastRecovery) {
      // Full ACK received: exit fast recovery (RFC 5681)
      congestion.cwnd = congestion.ssthresh;
      congestion.phase = 'CongestionAvoidance';
      congestion.fastRecovery = false;
      congestion.duplicateAckCount = 0;
    } else if (congestion.phase === 'SlowStart') {
      // Exponential growth per RTT round
      congestion.cwnd += 1;
      if (congestion.cwnd >= congestion.ssthresh) {
        congestion.phase = 'CongestionAvoidance';
        if (congestion.algorithm === 'CUBIC') {
          congestion.lastLossTick = tick;
        }
      }
    } else if (congestion.phase === 'CongestionAvoidance') {
      if (congestion.algorithm === 'CUBIC') {
        const elapsedRtts = Math.max(
          0,
          (tick - congestion.lastLossTick) / Math.max(1, congestion.rttTicks),
        );
        const target = computeCubicTarget(congestion.wMax, elapsedRtts);
        if (target > congestion.cwnd) {
          congestion.cwnd += Number(((target - congestion.cwnd) / congestion.cwnd).toFixed(2));
        } else {
          congestion.cwnd += Number((1 / Math.floor(congestion.cwnd)).toFixed(2));
        }
      } else {
        // Classic Reno linear additive increase
        congestion.cwnd += Number((1 / Math.floor(congestion.cwnd)).toFixed(2));
      }
    }
  }

  congestion.history.push({
    tick,
    cwnd: Number(congestion.cwnd.toFixed(2)),
    phase: congestion.phase,
  });
}
