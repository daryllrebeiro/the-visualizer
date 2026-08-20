'use client';

import React, { useEffect, useRef, useState } from 'react';

import type { KafkaClusterState } from '@the-visualizer/contracts';

import { Visualizer } from './visualizer';
import { type ConnectionStatus, type EventLogItem, WebSocketClient } from './ws-client';

/* ─── helpers ─── */
function statusDotClass(s: ConnectionStatus): string {
  if (s === 'CONNECTED')   return 'status-dot status-dot--connected';
  if (s === 'CONNECTING')  return 'status-dot status-dot--connecting';
  return 'status-dot status-dot--disconnected';
}

function statusBadgeClass(s: ConnectionStatus): string {
  if (s === 'CONNECTED')   return 'status-badge status-badge--connected';
  if (s === 'CONNECTING')  return 'status-badge status-badge--connecting';
  return 'status-badge status-badge--disconnected';
}

function logEntryClass(type: EventLogItem['type']): string {
  return `log-entry log-entry--${type.toLowerCase()}`;
}

function logBadgeClass(type: EventLogItem['type']): string {
  return `log-entry-badge log-entry-badge--${type.toLowerCase()}`;
}

/* ─── stat tile config ─── */
const STAT_TILES = [
  { key: 'tick',    label: 'Live Tick',     tile: 'stat-tile stat-tile--amber', value: 'stat-tile__value stat-tile__value--amber' },
  { key: 'ctrl',    label: 'Controller',    tile: 'stat-tile stat-tile--amber', value: 'stat-tile__value stat-tile__value--brown' },
  { key: 'alive',   label: 'Alive Brokers', tile: 'stat-tile stat-tile--green', value: 'stat-tile__value stat-tile__value--green' },
  { key: 'crashed', label: 'Crashed Nodes', tile: 'stat-tile stat-tile--rose',  value: 'stat-tile__value stat-tile__value--rose'  },
] as const;

/* ══════════════════════════════════════════════ */
export default function Page(): React.JSX.Element {
  const [restUrl, setRestUrl] = useState('http://localhost:3000');
  const [wsUrl,   setWsUrl]   = useState('ws://localhost:3001');
  const [roomId,  setRoomId]  = useState('room-1');
  const [token,   setToken]   = useState('');

  const [status,        setStatus]        = useState<ConnectionStatus>('DISCONNECTED');
  const [liveState,     setLiveState]     = useState<KafkaClusterState | null>(null);
  const [renderedState, setRenderedState] = useState<KafkaClusterState | null>(null);
  const [eventLogs,     setEventLogs]     = useState<EventLogItem[]>([]);
  const [hoverDetails,  setHoverDetails]  = useState<string | null>(null);

  const [isPaused,     setIsPaused]     = useState(false);
  const [playbackTick, setPlaybackTick] = useState(0);
  const [stateHistory, setStateHistory] = useState<KafkaClusterState[]>([]);
  const [isHalted,     setIsHalted]     = useState(false);
  const [haltError,    setHaltError]    = useState<string | null>(null);

  const clientRef = useRef<WebSocketClient | null>(null);

  useEffect(() => { void handleSandboxLogin(); }, []);

  useEffect(() => {
    if (!liveState) return;
    setStateHistory((prev) => {
      const next = [...prev, JSON.parse(JSON.stringify(liveState)) as KafkaClusterState];
      if (next.length > 500) next.shift();
      return next;
    });
    if (!isPaused) {
      setRenderedState(liveState);
      setPlaybackTick(liveState.tick);
    }
  }, [liveState, isPaused]);

  /* ── connection ── */
  const handleConnect = () => {
    if (clientRef.current) clientRef.current.disconnect();
    if (!token) { addLog('Cannot connect: auth token missing.', 'ERROR'); return; }
    setIsHalted(false); setHaltError(null); setStateHistory([]);
    const client = new WebSocketClient(wsUrl, token, roomId, {
      onStateChange:  (s) => { setLiveState(s); },
      onStatusChange: (s) => { setStatus(s); },
      onHalt:         (e) => { setIsHalted(true); setHaltError(e); },
      onEventLog:     (l) => { setEventLogs((p) => [l, ...p].slice(0, 100)); },
    });
    clientRef.current = client;
    client.connect();
  };

  const handleDisconnect = () => {
    clientRef.current?.disconnect();
    clientRef.current = null;
    setLiveState(null);
    setRenderedState(null);
  };

  const handleSandboxLogin = async () => {
    try {
      addLog('Requesting developer credentials...', 'INFO');
      const res = await fetch(`${restUrl}/auth/dev-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@the-visualizer.io', name: 'Sandbox Admin' }),
      });
      if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
      const data = (await res.json()) as { success: boolean; data?: { token?: string } };
      const t = data.data?.token;
      if (t) { setToken(t); addLog('Credentials loaded.', 'SUCCESS'); }
      else throw new Error('No token in response');
    } catch (err: unknown) {
      addLog(`Credentials failed: ${err instanceof Error ? err.message : 'Unknown'}`, 'ERROR');
    }
  };

  const addLog = (message: string, type: EventLogItem['type']) => {
    setEventLogs((p) => [
      { id: Math.random().toString(36).substring(7), timestamp: Date.now(), message, type },
      ...p,
    ].slice(0, 100));
  };

  /* ── sim actions ── */
  const handleProduceIntent = () => {
    clientRef.current?.sendIntent('PRODUCE', { topic: 'orders', value: { orderId: Math.floor(Math.random() * 1000) + 1 } });
    addLog('Dispatched: PRODUCE on topic "orders"', 'INFO');
  };

  const handleKillBroker = () => {
    if (!liveState) return;
    const alive = Object.keys(liveState.brokers).filter((id) => liveState.brokers[id]?.status === 'ALIVE');
    if (!alive.length) return;
    const id = alive[Math.floor(Math.random() * alive.length)];
    if (clientRef.current && id) {
      clientRef.current.sendIntent('CHAOS_KILL_BROKER', { brokerId: id });
      addLog(`Dispatched: CRASH broker ${id}`, 'WARN');
    }
  };

  const handleRecoverBroker = () => {
    if (!liveState) return;
    const crashed = Object.keys(liveState.brokers).filter((id) => liveState.brokers[id]?.status === 'CRASHED');
    if (!crashed.length) { addLog('All brokers ALIVE.', 'INFO'); return; }
    const id = crashed[Math.floor(Math.random() * crashed.length)];
    if (clientRef.current && id) {
      clientRef.current.sendIntent('CHAOS_RECOVER_BROKER', { brokerId: id });
      addLog(`Dispatched: RECOVER broker ${id}`, 'INFO');
    }
  };

  const handleConsumerJoin = () => {
    clientRef.current?.sendIntent('CONSUMER_JOIN', { groupId: 'order-processors', topics: ['orders'] });
    addLog('Dispatched: CONSUMER_JOIN "order-processors"', 'INFO');
  };

  const handleConsumerLeave = () => {
    clientRef.current?.sendIntent('CONSUMER_LEAVE', { groupId: 'order-processors' });
    addLog('Dispatched: CONSUMER_LEAVE "order-processors"', 'INFO');
  };

  const handleScrubChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value, 10);
    setPlaybackTick(v);
    const s = stateHistory.find((s) => s.tick === v);
    if (s) setRenderedState(s);
  };

  /* ── derived ── */
  const aliveBrokers   = Object.values(liveState?.brokers ?? {}).filter((b) => b.status === 'ALIVE').length;
  const crashedBrokers = Object.values(liveState?.brokers ?? {}).filter((b) => b.status === 'CRASHED').length;
  const connected = status === 'CONNECTED';

  const statValues: Record<string, string> = {
    tick:    String(liveState?.tick ?? 0),
    ctrl:    liveState?.kraft.activeControllerId ?? 'NONE',
    alive:   String(aliveBrokers),
    crashed: String(crashedBrokers),
  };

  /* ══════════ RENDER ══════════ */
  return (
    <div className="app-shell">

      {/* ── Header ── */}
      <header className="app-header">

        <div className="header-brand">
          <span className={statusDotClass(status)} />
          <h1 className="header-brand-title">TheVisualizer</h1>
          <span className={statusBadgeClass(status)}>{status}</span>
        </div>

        <div className="header-right">
          {/* Connection pill */}
          <div className="connection-pill">
            <div className="connection-field">
              <span className="connection-field-label">REST Gateway</span>
              <input
                type="text"
                value={restUrl}
                onChange={(e) => setRestUrl(e.target.value)}
                className="connection-field-input"
                style={{ width: 160 }}
              />
            </div>
            <div className="connection-divider" />
            <div className="connection-field">
              <span className="connection-field-label">WS Tunnel</span>
              <input
                type="text"
                value={wsUrl}
                onChange={(e) => setWsUrl(e.target.value)}
                className="connection-field-input"
                style={{ width: 160 }}
              />
            </div>
            <div className="connection-divider" />
            <div className="connection-field">
              <span className="connection-field-label">Room</span>
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="connection-field-input"
                style={{ width: 72 }}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="header-actions">
            <button onClick={() => { void handleSandboxLogin(); }} className="btn btn--ghost">
              Auth Dev
            </button>
            {connected
              ? <button onClick={handleDisconnect} className="btn btn--rose">Disconnect</button>
              : <button onClick={handleConnect}    className="btn btn--emerald">Connect</button>
            }
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="app-body">

        {/* ── Left Sidebar ── */}
        <aside className="sidebar">

          {/* System Overview */}
          <div className="card card--yellow">
            <p className="card-title card-title--yellow">System Overview</p>
            <div className="stat-grid">
              {STAT_TILES.map((tile) => (
                <div key={tile.key} className={tile.tile}>
                  <span className={tile.value}>{statValues[tile.key]}</span>
                  <span className="stat-tile__label">{tile.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Simulation Control */}
          <div className="card card--blue">
            <p className="card-title card-title--blue">Simulation Control</p>
            <div className="btn-row">
              <button onClick={handleProduceIntent}  disabled={!connected || isHalted} className="btn btn--primary">Produce Msg</button>
              <button onClick={handleConsumerJoin}   disabled={!connected || isHalted} className="btn btn--indigo">Join Consumer</button>
              <button onClick={handleConsumerLeave}  disabled={!connected || isHalted} className="btn btn--ghost">Leave Consumer</button>
            </div>
          </div>

          {/* Chaos Laboratory */}
          <div className="card card--pink">
            <p className="card-title card-title--pink">Chaos Laboratory</p>
            <div className="btn-row">
              <button onClick={handleKillBroker}    disabled={!connected || isHalted} className="btn btn--rose">💥 Crash Broker</button>
              <button onClick={handleRecoverBroker} disabled={!connected || isHalted} className="btn btn--emerald">🔧 Recover Broker</button>
            </div>
          </div>

          {/* Playback Scrubber */}
          <div className="card card--green card--scrubber-push">
            <p className="card-title card-title--green">Playback Scrubber</p>
            <div className="btn-row--single">
              <button
                onClick={() => setIsPaused(!isPaused)}
                className={`btn ${isPaused ? 'btn--emerald' : 'btn--ghost'}`}
              >
                {isPaused ? '▶ Resume Stream' : '❚❚ Pause Stream'}
              </button>
            </div>
            {isPaused && stateHistory.length > 1 && (
              <div className="scrubber-body">
                <hr className="scrubber-divider" />
                <div className="scrubber-range-row">
                  <span>Tick {String(stateHistory[0]?.tick ?? 0)}</span>
                  <span>▶ {String(playbackTick)}</span>
                  <span>{String(stateHistory[stateHistory.length - 1]?.tick ?? 0)}</span>
                </div>
                <input
                  type="range"
                  className="scrubber-input"
                  min={stateHistory[0]?.tick ?? 0}
                  max={stateHistory[stateHistory.length - 1]?.tick ?? 0}
                  value={playbackTick}
                  onChange={handleScrubChange}
                />
              </div>
            )}
          </div>
        </aside>

        {/* ── Center Canvas ── */}
        <main className="canvas-panel">
          <Visualizer state={renderedState} onHoverDetails={setHoverDetails} />
          {hoverDetails && (
            <div className="hover-tooltip">{hoverDetails}</div>
          )}
          {isPaused && (
            <div className="scrub-badge">❚❚ Scrubbing · Tick {String(playbackTick)}</div>
          )}
        </main>

        {/* ── Right Event Log ── */}
        <aside className="card card--purple log-sidebar">
          <p className="card-title card-title--purple">Event Log Stream</p>
          <div className="log-list">
            {eventLogs.length === 0
              ? <div className="log-empty">No events captured yet</div>
              : eventLogs.map((log) => (
                <div key={log.id} className={logEntryClass(log.type)}>
                  <div className="log-entry-header">
                    <span className="log-entry-time">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={logBadgeClass(log.type)}>{log.type}</span>
                  </div>
                  <p className="log-entry-message">{log.message}</p>
                </div>
              ))
            }
          </div>
        </aside>
      </div>

      {/* ── Halt Banner ── */}
      {isHalted && (
        <div className="halt-banner">
          <span className="halt-banner-text">
            ⚠️ INVARIANT VIOLATION: {haltError ?? 'Protocol Exception'}
          </span>
          <button
            className="halt-banner-reset"
            onClick={() => { setIsHalted(false); setHaltError(null); handleConnect(); }}
          >
            Reset Session
          </button>
        </div>
      )}
    </div>
  );
}
