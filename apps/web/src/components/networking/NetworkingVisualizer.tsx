'use client';

import React from 'react';
import type {
  NetworkingClusterState,
} from '@the-visualizer/simulation';

interface NetworkingVisualizerProps {
  state: NetworkingClusterState;
  onStartHandshake: () => void;
  onSendData: () => void;
  onDropPacket: () => void;
  onConfigureFidelity?: (algorithm: 'RENO' | 'CUBIC') => void;
}

export function NetworkingVisualizer({
  state,
  onStartHandshake,
  onSendData,
  onDropPacket,
  onConfigureFidelity,
}: NetworkingVisualizerProps): React.JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px', gap: '16px' }}>
      {/* Top Banner: Protocol Metrics & Controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#0f172a',
          padding: '12px 16px',
          borderRadius: '8px',
          border: '1px solid #1e293b',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '1.4rem' }}>🌐</span>
          <div>
            <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#f8fafc' }}>
              Networking Fundamentals (TCP Handshake, Sliding Window & AIMD Congestion Control)
            </h2>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              Client: <strong style={{ color: state.clientState === 'ESTABLISHED' ? '#4ade80' : '#fbbf24' }}>{state.clientState}</strong> · Server: <strong style={{ color: state.serverState === 'ESTABLISHED' ? '#4ade80' : '#fbbf24' }}>{state.serverState}</strong> · Algorithm: <strong style={{ color: state.congestion.algorithm === 'CUBIC' ? '#ec4899' : '#38bdf8' }}>{state.congestion.algorithm}</strong> · cwnd: <strong style={{ color: '#06b6d4' }}>{state.congestion.cwnd.toFixed(1)} MSS</strong> · ssthresh: <strong style={{ color: '#a855f7' }}>{state.congestion.ssthresh}</strong> · Phase: <strong style={{ color: state.congestion.phase === 'SlowStart' ? '#38bdf8' : '#f59e0b' }}>{state.congestion.phase}</strong>
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {onConfigureFidelity && (
            <div style={{ display: 'flex', border: '1px solid #334155', borderRadius: '4px', overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => onConfigureFidelity('RENO')}
                style={{
                  padding: '4px 8px',
                  fontSize: '0.7rem',
                  backgroundColor: state.congestion.algorithm === 'RENO' ? '#38bdf8' : '#1e293b',
                  color: '#ffffff',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                📖 Reno (AIMD)
              </button>
              <button
                type="button"
                onClick={() => onConfigureFidelity('CUBIC')}
                style={{
                  padding: '4px 8px',
                  fontSize: '0.7rem',
                  backgroundColor: state.congestion.algorithm === 'CUBIC' ? '#ec4899' : '#1e293b',
                  color: '#ffffff',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                ⚙️ CUBIC (Linux)
              </button>
            </div>
          )}
          <button
            onClick={onStartHandshake}
            disabled={state.clientState !== 'CLOSED'}
            className="btn btn--primary"
            style={{ padding: '5px 10px', fontSize: '0.75rem' }}
          >
            🤝 3-Way Handshake
          </button>
          <button
            onClick={onSendData}
            disabled={state.clientState !== 'ESTABLISHED'}
            className="btn btn--emerald"
            style={{ padding: '5px 10px', fontSize: '0.75rem' }}
          >
            📦 Send Data
          </button>
          <button
            onClick={onDropPacket}
            disabled={state.inFlightPackets.length === 0}
            className="btn btn--rose"
            style={{ padding: '5px 10px', fontSize: '0.75rem' }}
          >
            ⚠️ Drop Packet (Loss)
          </button>
        </div>
      </div>

      {/* Main Grid: 2 Columns [ Packet Sequence Ladder & In-Flight | Sliding Window & Congestion Curve ] */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px', flex: 1, minHeight: 0 }}>
        {/* Left Column: Client <-> Server Packet Flow */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', backgroundColor: '#0f172a', borderRadius: '8px', padding: '16px', border: '1px solid #1e293b', overflowY: 'auto' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc', borderBottom: '1px solid #1e293b', paddingBottom: '6px' }}>
            🛰️ TCP Packet Stream & Sequence Timeline
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Client Endpoint */}
            <div style={{ backgroundColor: '#020617', border: '1px solid #38bdf8', borderRadius: '6px', padding: '10px' }}>
              <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#38bdf8' }}>💻 Client Endpoint</div>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>State: <strong>{state.clientState}</strong></div>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Next Seq: <code>{state.clientSeqNumber}</code> | Ack: <code>{state.clientAckNumber}</code></div>
            </div>

            {/* Server Endpoint */}
            <div style={{ backgroundColor: '#020617', border: '1px solid #a855f7', borderRadius: '6px', padding: '10px' }}>
              <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#a855f7' }}>🖥️ Server Endpoint</div>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>State: <strong>{state.serverState}</strong></div>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Next Seq: <code>{state.serverSeqNumber}</code> | Ack: <code>{state.serverAckNumber}</code></div>
            </div>
          </div>

          {/* In-Flight Packets */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#f8fafc' }}>
              ✈️ In-Flight Wire Packets ({state.inFlightPackets.length})
            </span>
            {state.inFlightPackets.length === 0 ? (
              <span style={{ fontSize: '0.7rem', color: '#475569', fontStyle: 'italic' }}>(no packets on wire)</span>
            ) : (
              state.inFlightPackets.map((pkt) => (
                <div
                  key={pkt.id}
                  style={{
                    backgroundColor: '#020617',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    padding: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: pkt.source === 'CLIENT' ? '#38bdf8' : '#a855f7' }}>
                      {pkt.source} → {pkt.destination}
                    </span>
                    <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '3px', backgroundColor: 'rgba(6, 182, 212, 0.2)', color: '#06b6d4', fontWeight: 700 }}>
                      [{pkt.flags.join(', ')}]
                    </span>
                  </div>
                  <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: '#cbd5e1' }}>
                    seq={pkt.seqNumber} ack={pkt.ackNumber} {pkt.payload ? `("${pkt.payload}")` : ''}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Sliding Window & AIMD Congestion Curve */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', backgroundColor: '#0f172a', borderRadius: '8px', padding: '16px', border: '1px solid #1e293b', overflowY: 'auto' }}>
          {/* Sliding Window */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc' }}>
              🪟 TCP Sliding Window Buffer (Advertised Window: {state.windowSize} pkts)
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(75px, 1fr))', gap: '6px' }}>
              {state.slidingWindow.map((slot) => {
                const colorMap = {
                  SentAndAcked: '#4ade80',
                  SentUnacked: '#fbbf24',
                  UsableNotSent: '#38bdf8',
                  NotUsable: '#475569',
                };
                return (
                  <div
                    key={slot.seqNumber}
                    style={{
                      backgroundColor: '#020617',
                      border: `1px solid ${colorMap[slot.state]}`,
                      borderRadius: '4px',
                      padding: '6px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                    }}
                  >
                    <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', fontWeight: 700, color: '#f8fafc' }}>
                      #{slot.seqNumber}
                    </span>
                    <span style={{ fontSize: '0.55rem', color: colorMap[slot.state] }}>
                      {slot.state}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* AIMD Congestion Window History */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc' }}>
                📈 AIMD Congestion Curve (cwnd History)
              </span>
              <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                Drops: <strong style={{ color: '#f43f5e' }}>{state.totalPacketsDropped}</strong>
              </span>
            </div>

            <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', height: '100px', backgroundColor: '#020617', padding: '8px', borderRadius: '6px', border: '1px solid #1e293b' }}>
              {state.congestion.history.slice(-20).map((h, idx) => {
                const heightPct = Math.min(100, Math.max(10, (h.cwnd / 16) * 100));
                return (
                  <div
                    key={idx}
                    title={`Tick ${h.tick}: cwnd=${h.cwnd} (${h.phase})`}
                    style={{
                      flex: 1,
                      height: `${heightPct}%`,
                      backgroundColor: h.phase === 'SlowStart' ? '#38bdf8' : '#f59e0b',
                      borderRadius: '2px 2px 0 0',
                      transition: 'height 0.2s ease',
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
