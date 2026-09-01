import type { ScenarioDefinition } from '../../engine/types.js';

export const NETWORKING_SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'tcp-three-way-handshake',
    title: 'TCP 3-Way Handshake Connection Establishment',
    badge: 'Protocol Fundamentals',
    description:
      'Walks through the client-server TCP 3-way handshake: Client sends SYN -> Server responds SYN-ACK -> Client replies ACK, establishing bidirectional sequence numbering.',
    steps: [
      '1. Client SYN: Client in CLOSED state sends SYN packet (seq=1000) and enters SYN_SENT.',
      '2. Server SYN-ACK: Server in LISTEN state receives SYN, records ack=1001, replies with SYN-ACK (seq=5000), enters SYN_RECEIVED.',
      '3. Client ACK: Client receives SYN-ACK, transitions to ESTABLISHED, and sends final ACK (ack=5001).',
      '4. Server ESTABLISHED: Server receives final ACK and transitions to ESTABLISHED state.',
    ],
    actionLabel: '▶ Run 3-Way Handshake Lab',
    tags: ['networking', 'tcp', 'handshake', 'syn-ack'],
  },
  {
    id: 'tcp-congestion-aimd',
    title: 'TCP Congestion Control (Slow Start & AIMD Sawtooth)',
    badge: 'Congestion Control',
    description:
      'Demonstrates TCP Congestion Control dynamics: exponential window growth during Slow Start, linear additive increase during Congestion Avoidance, and multiplicative window reduction upon packet drop.',
    steps: [
      '1. Slow Start Ramp: cwnd starts at 1 MSS and doubles every RTT round (1 -> 2 -> 4 -> 8).',
      '2. Hit ssthresh: Once cwnd reaches ssthresh (8), transitions to Congestion Avoidance with linear +1 increase.',
      '3. Packet Loss Event: Induce packet drop -> Multiplicative decrease cuts ssthresh to cwnd/2 and resets cwnd to 1.',
      '4. Recovery Ramp: Fast re-acceleration up to new ssthresh threshold.',
    ],
    actionLabel: '▶ Run AIMD Congestion Lab',
    tags: ['networking', 'tcp', 'congestion', 'aimd', 'slow-start'],
  },
];
