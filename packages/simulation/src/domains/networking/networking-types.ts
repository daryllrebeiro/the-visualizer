export type TCPPacketFlag = 'SYN' | 'SYN-ACK' | 'ACK' | 'FIN' | 'RST' | 'PSH' | 'DATA';

export type TCPConnectionState =
  | 'CLOSED'
  | 'LISTEN'
  | 'SYN_SENT'
  | 'SYN_RECEIVED'
  | 'ESTABLISHED'
  | 'FIN_WAIT_1'
  | 'FIN_WAIT_2'
  | 'CLOSE_WAIT'
  | 'LAST_ACK'
  | 'TIME_WAIT';

export type CongestionPhase = 'SlowStart' | 'CongestionAvoidance' | 'FastRecovery';

export type TCPCongestionAlgorithm = 'CUBIC' | 'RENO';

export interface SackBlock {
  leftEdge: number;
  rightEdge: number;
}

export interface TCPPacket {
  id: string;
  source: 'CLIENT' | 'SERVER';
  destination: 'CLIENT' | 'SERVER';
  seqNumber: number;
  ackNumber: number;
  flags: TCPPacketFlag[];
  windowSize: number;
  payloadLength: number;
  payload: string;
  sentAtTick: number;
  state: 'InFlight' | 'Delivered' | 'Dropped';
  sackBlocks?: SackBlock[] | undefined;
}

export interface CongestionControlState {
  algorithm: TCPCongestionAlgorithm;
  cwnd: number; // in packets/MSS
  ssthresh: number;
  phase: CongestionPhase;
  rttTicks: number;
  duplicateAckCount: number;
  lastLossTick: number;
  wMax: number;
  k: number; // CUBIC inflection point time
  srttTicks: number; // RFC 6298 smoothed RTT
  rttvarTicks: number; // RFC 6298 RTT variance
  rtoTicks: number; // RFC 6298 retransmission timeout
  fastRecovery: boolean;
  history: Array<{ tick: number; cwnd: number; phase: CongestionPhase }>;
}

export interface TCPSlidingWindowSlot {
  seqNumber: number;
  payload: string;
  state: 'SentAndAcked' | 'SentUnacked' | 'UsableNotSent' | 'NotUsable';
  sentTick: number | null;
  isSacked?: boolean;
}

export interface NetworkingClusterState {
  clusterId: string;
  tick: number;
  rngState: number;
  fidelityMode: 'TEXTBOOK' | 'REALISTIC';
  clientState: TCPConnectionState;
  serverState: TCPConnectionState;
  clientSeqNumber: number;
  serverSeqNumber: number;
  clientAckNumber: number;
  serverAckNumber: number;
  windowSize: number;
  windowScaleShift: number; // RFC 7323 window scale (0 - 14)
  effectiveWindowSize: number; // windowSize << windowScaleShift
  sackEnabled: boolean; // RFC 2018 SACK toggle
  nagleEnabled: boolean; // RFC 896 Nagle toggle
  nagleBuffer: string;
  inFlightPackets: TCPPacket[];
  deliveredPackets: TCPPacket[];
  slidingWindow: TCPSlidingWindowSlot[];
  congestion: CongestionControlState;
  totalPacketsSent: number;
  totalPacketsDropped: number;
  totalRetransmissions: number;
  totalFastRetransmissions: number;
  totalTimeoutRetransmissions: number;
}

export type NetworkEventType =
  | 'TCP_START_HANDSHAKE'
  | 'TCP_SEND_DATA'
  | 'TCP_DROP_PACKET'
  | 'TCP_TICK'
  | 'TCP_CLOSE_CONNECTION'
  | 'TCP_CONFIGURE_FIDELITY';

export interface NetworkSimEvent {
  id: string;
  tick: number;
  type: NetworkEventType;
  payload: Record<string, unknown>;
}
