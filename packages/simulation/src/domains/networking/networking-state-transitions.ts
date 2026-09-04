import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import {
  advanceCongestionWindow,
  createInitialCongestionState,
  createInitialSlidingWindow,
  updateRttAndRto,
} from './congestion-control.js';
import type {
  NetworkSimEvent,
  NetworkingClusterState,
  TCPCongestionAlgorithm,
  TCPPacket,
} from './networking-types.js';

export interface NetworkTransitionResult {
  nextState: NetworkingClusterState;
  emittedEvents: NetworkSimEvent[];
}

export function createDefaultNetworkingCluster(
  clusterId = 'tcp-cluster-1',
): NetworkingClusterState {
  const windowSize = 4;
  const windowScaleShift = 0;

  return {
    clusterId,
    tick: 0,
    rngState: 42,
    fidelityMode: 'TEXTBOOK',
    clientState: 'CLOSED',
    serverState: 'LISTEN',
    clientSeqNumber: 1000,
    serverSeqNumber: 5000,
    clientAckNumber: 0,
    serverAckNumber: 0,
    windowSize,
    windowScaleShift,
    effectiveWindowSize: windowSize << windowScaleShift,
    sackEnabled: false,
    nagleEnabled: false,
    nagleBuffer: '',
    inFlightPackets: [],
    deliveredPackets: [],
    slidingWindow: createInitialSlidingWindow(1001, 12),
    congestion: createInitialCongestionState('RENO'), // Reno baseline for textbook, CUBIC for realistic
    totalPacketsSent: 0,
    totalPacketsDropped: 0,
    totalRetransmissions: 0,
    totalFastRetransmissions: 0,
    totalTimeoutRetransmissions: 0,
  };
}

export function pureNetworkingTransition(
  state: NetworkingClusterState,
  event: NetworkSimEvent,
  rng: DeterministicRNG,
): NetworkTransitionResult {
  const nextState: NetworkingClusterState = JSON.parse(
    JSON.stringify(state),
  ) as NetworkingClusterState;
  const emittedEvents: NetworkSimEvent[] = [];

  nextState.tick = event.tick;

  switch (event.type) {
    case 'TCP_START_HANDSHAKE': {
      if (nextState.clientState === 'CLOSED') {
        nextState.clientState = 'SYN_SENT';
        const synPkt: TCPPacket = {
          id: `pkt-syn-${String(nextState.tick)}`,
          source: 'CLIENT',
          destination: 'SERVER',
          seqNumber: nextState.clientSeqNumber,
          ackNumber: 0,
          flags: ['SYN'],
          windowSize: nextState.windowSize,
          payloadLength: 0,
          payload: '',
          sentAtTick: nextState.tick,
          state: 'InFlight',
        };
        nextState.inFlightPackets.push(synPkt);
        nextState.totalPacketsSent++;
      }
      break;
    }

    case 'TCP_SEND_DATA': {
      if (nextState.clientState === 'ESTABLISHED' && nextState.serverState === 'ESTABLISHED') {
        const nextSlot = nextState.slidingWindow.find((s) => s.state === 'UsableNotSent');
        if (nextSlot) {
          nextSlot.state = 'SentUnacked';
          nextSlot.sentTick = nextState.tick;

          const dataPkt: TCPPacket = {
            id: `pkt-data-${String(nextState.tick)}-${String(nextSlot.seqNumber)}`,
            source: 'CLIENT',
            destination: 'SERVER',
            seqNumber: nextSlot.seqNumber,
            ackNumber: nextState.clientAckNumber,
            flags: ['DATA'],
            windowSize: nextState.effectiveWindowSize,
            payloadLength: 100,
            payload: nextSlot.payload,
            sentAtTick: nextState.tick,
            state: 'InFlight',
          };
          nextState.inFlightPackets.push(dataPkt);
          nextState.totalPacketsSent++;
        }
      }
      break;
    }

    case 'TCP_DROP_PACKET': {
      if (nextState.inFlightPackets.length > 0) {
        const targetPkt = nextState.inFlightPackets[0]!;
        targetPkt.state = 'Dropped';
        nextState.inFlightPackets.shift();
        nextState.totalPacketsDropped++;
        nextState.totalTimeoutRetransmissions++;
        advanceCongestionWindow(nextState.congestion, nextState.tick, 'PACKET_LOSS');
      }
      break;
    }

    case 'TCP_TICK': {
      handlePacketDeliveryTick(nextState);
      break;
    }

    case 'TCP_CONFIGURE_FIDELITY': {
      const mode = event.payload['fidelityMode'] as 'TEXTBOOK' | 'REALISTIC';
      if (mode) nextState.fidelityMode = mode;

      const algo = event.payload['algorithm'] as TCPCongestionAlgorithm;
      if (algo) nextState.congestion.algorithm = algo;

      if (event.payload['sackEnabled'] !== undefined) {
        nextState.sackEnabled = Boolean(event.payload['sackEnabled']);
      }

      if (event.payload['windowScaleShift'] !== undefined) {
        const shift = Math.min(14, Math.max(0, Number(event.payload['windowScaleShift'])));
        nextState.windowScaleShift = shift;
        nextState.effectiveWindowSize = nextState.windowSize << shift;
      }

      if (event.payload['nagleEnabled'] !== undefined) {
        nextState.nagleEnabled = Boolean(event.payload['nagleEnabled']);
      }
      break;
    }
  }

  nextState.rngState = rng.getState();
  return { nextState, emittedEvents };
}

function handlePacketDeliveryTick(state: NetworkingClusterState): void {
  const remainingInFlight: TCPPacket[] = [];

  for (const pkt of state.inFlightPackets) {
    if (pkt.sentAtTick + 1 <= state.tick) {
      pkt.state = 'Delivered';
      state.deliveredPackets.push(pkt);

      if (pkt.flags.includes('SYN') && !pkt.flags.includes('SYN-ACK')) {
        // Server receives SYN
        state.serverState = 'SYN_RECEIVED';
        state.serverAckNumber = pkt.seqNumber + 1;

        // Server sends SYN-ACK
        const synAckPkt: TCPPacket = {
          id: `pkt-synack-${String(state.tick)}`,
          source: 'SERVER',
          destination: 'CLIENT',
          seqNumber: state.serverSeqNumber,
          ackNumber: state.serverAckNumber,
          flags: ['SYN-ACK', 'SYN', 'ACK'],
          windowSize: state.windowSize,
          payloadLength: 0,
          payload: '',
          sentAtTick: state.tick,
          state: 'InFlight',
        };
        remainingInFlight.push(synAckPkt);
        state.totalPacketsSent++;
      } else if (pkt.flags.includes('SYN-ACK')) {
        // Client receives SYN-ACK
        state.clientState = 'ESTABLISHED';
        state.clientAckNumber = pkt.seqNumber + 1;
        state.clientSeqNumber = pkt.ackNumber;

        // Client sends ACK to finalize handshake
        const ackPkt: TCPPacket = {
          id: `pkt-ack-${String(state.tick)}`,
          source: 'CLIENT',
          destination: 'SERVER',
          seqNumber: state.clientSeqNumber,
          ackNumber: state.clientAckNumber,
          flags: ['ACK'],
          windowSize: state.windowSize,
          payloadLength: 0,
          payload: '',
          sentAtTick: state.tick,
          state: 'InFlight',
        };
        remainingInFlight.push(ackPkt);
        state.totalPacketsSent++;
      } else if (pkt.flags.includes('ACK') && state.serverState === 'SYN_RECEIVED') {
        // Server receives final ACK
        state.serverState = 'ESTABLISHED';
      } else if (pkt.flags.includes('DATA')) {
        // Data segment arrival
        const expectedSeq = state.serverAckNumber;

        if (pkt.seqNumber === expectedSeq || expectedSeq === 0) {
          // In-order packet delivery
          state.serverAckNumber = pkt.seqNumber + pkt.payloadLength;

          const slot = state.slidingWindow.find((s) => s.seqNumber === pkt.seqNumber);
          if (slot) {
            slot.state = 'SentAndAcked';
            const nextUsable = state.slidingWindow.find((s) => s.state === 'NotUsable');
            if (nextUsable) nextUsable.state = 'UsableNotSent';
          }

          // Measure RTT & update RTO via RFC 6298
          const measuredRtt = Math.max(1, state.tick - pkt.sentAtTick);
          updateRttAndRto(state.congestion, measuredRtt);

          advanceCongestionWindow(state.congestion, state.tick, 'ACK_RECEIVED');
        } else if (pkt.seqNumber > expectedSeq) {
          // Out-of-order segment arrival -> trigger Duplicate ACK & optional SACK block (RFC 2018)
          const sackBlocks = state.sackEnabled
            ? [{ leftEdge: pkt.seqNumber, rightEdge: pkt.seqNumber + pkt.payloadLength }]
            : undefined;

          if (state.sackEnabled) {
            const sackedSlot = state.slidingWindow.find((s) => s.seqNumber === pkt.seqNumber);
            if (sackedSlot) sackedSlot.isSacked = true;
          }

          state.congestion.duplicateAckCount++;

          if (state.congestion.duplicateAckCount === 3) {
            // Triple Duplicate ACK -> Fast Retransmit (RFC 5681)
            state.totalFastRetransmissions++;
            state.totalRetransmissions++;
            advanceCongestionWindow(state.congestion, state.tick, 'TRIPLE_DUP_ACK');

            // Retransmit missing segment immediately without RTO timeout
            const missingSlot = state.slidingWindow.find((s) => s.seqNumber === expectedSeq);
            if (missingSlot) {
              const retransmitPkt: TCPPacket = {
                id: `pkt-fast-retransmit-${String(state.tick)}-${String(missingSlot.seqNumber)}`,
                source: 'CLIENT',
                destination: 'SERVER',
                seqNumber: missingSlot.seqNumber,
                ackNumber: state.clientAckNumber,
                flags: ['DATA'],
                windowSize: state.effectiveWindowSize,
                payloadLength: 100,
                payload: missingSlot.payload,
                sentAtTick: state.tick,
                state: 'InFlight',
                sackBlocks,
              };
              remainingInFlight.push(retransmitPkt);
              state.totalPacketsSent++;
            }
          }
        }
      }
    } else {
      remainingInFlight.push(pkt);
    }
  }

  state.inFlightPackets = remainingInFlight;
}
