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
}

export interface CongestionControlState {
  cwnd: number; // in packets/MSS
  ssthresh: number;
  phase: CongestionPhase;
  rttTicks: number;
  duplicateAckCount: number;
  history: Array<{ tick: number; cwnd: number; phase: CongestionPhase }>;
}

export interface TCPSlidingWindowSlot {
  seqNumber: number;
  payload: string;
  state: 'SentAndAcked' | 'SentUnacked' | 'UsableNotSent' | 'NotUsable';
  sentTick: number | null;
}

export interface NetworkingClusterState {
  clusterId: string;
  tick: number;
  rngState: number;
  clientState: TCPConnectionState;
  serverState: TCPConnectionState;
  clientSeqNumber: number;
  serverSeqNumber: number;
  clientAckNumber: number;
  serverAckNumber: number;
  windowSize: number;
  inFlightPackets: TCPPacket[];
  deliveredPackets: TCPPacket[];
  slidingWindow: TCPSlidingWindowSlot[];
  congestion: CongestionControlState;
  totalPacketsSent: number;
  totalPacketsDropped: number;
  totalRetransmissions: number;
}

export type NetworkEventType =
  | 'TCP_START_HANDSHAKE'
  | 'TCP_SEND_DATA'
  | 'TCP_DROP_PACKET'
  | 'TCP_TICK'
  | 'TCP_CLOSE_CONNECTION';

export interface NetworkSimEvent {
  id: string;
  tick: number;
  type: NetworkEventType;
  payload: Record<string, unknown>;
}
