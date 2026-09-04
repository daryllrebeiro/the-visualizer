import { z } from 'zod';

export const TCPPacketFlagSchema = z.enum(['SYN', 'SYN-ACK', 'ACK', 'FIN', 'RST', 'PSH', 'DATA']);
export type TCPPacketFlag = z.infer<typeof TCPPacketFlagSchema>;

export const TCPConnectionStateSchema = z.enum([
  'CLOSED',
  'LISTEN',
  'SYN_SENT',
  'SYN_RECEIVED',
  'ESTABLISHED',
  'FIN_WAIT_1',
  'FIN_WAIT_2',
  'CLOSE_WAIT',
  'LAST_ACK',
  'TIME_WAIT',
]);
export type TCPConnectionState = z.infer<typeof TCPConnectionStateSchema>;

export const CongestionPhaseSchema = z.enum(['SlowStart', 'CongestionAvoidance', 'FastRecovery']);
export type CongestionPhase = z.infer<typeof CongestionPhaseSchema>;

export const TCPPacketSchema = z.object({
  id: z.string().min(1),
  source: z.enum(['CLIENT', 'SERVER']),
  destination: z.enum(['CLIENT', 'SERVER']),
  seqNumber: z.number().int().nonnegative(),
  ackNumber: z.number().int().nonnegative(),
  flags: z.array(TCPPacketFlagSchema),
  windowSize: z.number().int().nonnegative(),
  payloadLength: z.number().int().nonnegative(),
  payload: z.string().default(''),
  sentAtTick: z.number().nonnegative(),
  state: z.enum(['InFlight', 'Delivered', 'Dropped']).default('InFlight'),
});
export type TCPPacket = z.infer<typeof TCPPacketSchema>;

export const CongestionControlStateSchema = z.object({
  cwnd: z.number().positive().default(1), // in MSS packets
  ssthresh: z.number().positive().default(16), // Slow Start Threshold
  phase: CongestionPhaseSchema.default('SlowStart'),
  rttTicks: z.number().positive().default(2),
  duplicateAckCount: z.number().int().nonnegative().default(0),
  history: z
    .array(z.object({ tick: z.number(), cwnd: z.number(), phase: CongestionPhaseSchema }))
    .default([]),
});
export type CongestionControlState = z.infer<typeof CongestionControlStateSchema>;

export const TCPSlidingWindowSlotSchema = z.object({
  seqNumber: z.number().int().nonnegative(),
  payload: z.string(),
  state: z.enum(['SentAndAcked', 'SentUnacked', 'UsableNotSent', 'NotUsable']),
  sentTick: z.number().nullable().default(null),
});
export type TCPSlidingWindowSlot = z.infer<typeof TCPSlidingWindowSlotSchema>;

export const NetworkingClusterStateSchema = z.object({
  clusterId: z.string(),
  tick: z.number().nonnegative(),
  rngState: z.number().int(),
  clientState: TCPConnectionStateSchema.default('CLOSED'),
  serverState: TCPConnectionStateSchema.default('LISTEN'),
  clientSeqNumber: z.number().int().nonnegative().default(1000),
  serverSeqNumber: z.number().int().nonnegative().default(5000),
  clientAckNumber: z.number().int().nonnegative().default(0),
  serverAckNumber: z.number().int().nonnegative().default(0),
  windowSize: z.number().int().positive().default(8),
  inFlightPackets: z.array(TCPPacketSchema).default([]),
  deliveredPackets: z.array(TCPPacketSchema).default([]),
  slidingWindow: z.array(TCPSlidingWindowSlotSchema).default([]),
  congestion: CongestionControlStateSchema,
  totalPacketsSent: z.number().int().nonnegative().default(0),
  totalPacketsDropped: z.number().int().nonnegative().default(0),
  totalRetransmissions: z.number().int().nonnegative().default(0),
});
export type NetworkingClusterState = z.infer<typeof NetworkingClusterStateSchema>;
