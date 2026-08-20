'use client';

import React, { useEffect, useRef, useState } from 'react';

import type { KafkaClusterState } from '@the-visualizer/contracts';

import { Visualizer } from './visualizer';
import { type ConnectionStatus, type EventLogItem, WebSocketClient } from './ws-client';

export default function Page(): React.JSX.Element {
  // Configs
  const [restUrl, setRestUrl] = useState('http://localhost:3000');
  const [wsUrl, setWsUrl] = useState('ws://localhost:3001');
  const [roomId, setRoomId] = useState('room-1');
  const [token, setToken] = useState('');

  // Client and state
  const [status, setStatus] = useState<ConnectionStatus>('DISCONNECTED');
  const [liveState, setLiveState] = useState<KafkaClusterState | null>(null);
  const [renderedState, setRenderedState] = useState<KafkaClusterState | null>(null);
  const [eventLogs, setEventLogs] = useState<EventLogItem[]>([]);
  const [hoverDetails, setHoverDetails] = useState<string | null>(null);

  // Playback controls (Client-side scrubbing)
  const [isPaused, setIsPaused] = useState(false);
  const [playbackTick, setPlaybackTick] = useState(0);
  const [stateHistory, setStateHistory] = useState<KafkaClusterState[]>([]);

  // Safety halt state
  const [isHalted, setIsHalted] = useState(false);
  const [haltError, setHaltError] = useState<string | null>(null);

  const clientRef = useRef<WebSocketClient | null>(null);

  // Auto-authenticate on mount to secure out-of-the-box connectivity
  useEffect(() => {
    void handleSandboxLogin();
  }, []);

  // Update playback slider bounds when state changes
  useEffect(() => {
    if (!liveState) return;

    setStateHistory((prev) => {
      // Keep last 500 ticks of history for scrubbing
      const nextHist = [...prev, JSON.parse(JSON.stringify(liveState)) as KafkaClusterState];
      if (nextHist.length > 500) {
        nextHist.shift();
      }
      return nextHist;
    });

    if (!isPaused) {
      setRenderedState(liveState);
      setPlaybackTick(liveState.tick);
    }
  }, [liveState, isPaused]);

  // Handle connection
  const handleConnect = () => {
    if (clientRef.current) {
      clientRef.current.disconnect();
    }

    if (!token) {
      addLocalLog(
        'Cannot connect: auth token is missing. Please click sandbox login first.',
        'ERROR',
      );
      return;
    }

    setIsHalted(false);
    setHaltError(null);
    setStateHistory([]);

    const client = new WebSocketClient(wsUrl, token, roomId, {
      onStateChange: (state) => {
        setLiveState(state);
      },
      onStatusChange: (status) => {
        setStatus(status);
      },
      onHalt: (error) => {
        setIsHalted(true);
        setHaltError(error);
      },
      onEventLog: (log) => {
        setEventLogs((prev) => {
          const next = [log, ...prev];
          return next.slice(0, 100); // Keep last 100 logs
        });
      },
    });

    clientRef.current = client;
    client.connect();
  };

  const handleDisconnect = () => {
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }
    setLiveState(null);
    setRenderedState(null);
  };

  // Sandbox login credentials fetch
  const handleSandboxLogin = async () => {
    try {
      addLocalLog('Requesting sandbox developer credentials...', 'INFO');
      const response = await fetch(`${restUrl}/auth/dev-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'admin@the-visualizer.io',
          name: 'Sandbox Admin',
        }),
      });

      if (!response.ok) {
        throw new Error(`REST server returned status ${String(response.status)}`);
      }

      const data = (await response.json()) as { success: boolean; data?: { token?: string } };
      const generatedToken = data.data?.token;

      if (generatedToken) {
        setToken(generatedToken);
        addLocalLog('Sandbox credentials successfully loaded. Ready to connect!', 'SUCCESS');
      } else {
        throw new Error('No token found in response payload');
      }
    } catch (err: any) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      addLocalLog(`Sandbox developer credentials load failed: ${message}`, 'ERROR');
    }
  };

  const addLocalLog = (message: string, type: EventLogItem['type']) => {
    const log: EventLogItem = {
      id: Math.random().toString(36).substring(7),
      timestamp: Date.now(),
      message,
      type,
    };
    setEventLogs((prev) => [log, ...prev].slice(0, 100));
  };

  // Dispatch client intents
  const handleProduceIntent = () => {
    if (clientRef.current) {
      clientRef.current.sendIntent('PRODUCE', {
        topic: 'orders',
        value: { orderId: Math.floor(Math.random() * 1000) + 1 },
      });
      addLocalLog('Dispatched intent: PRODUCE message on topic "orders"', 'INFO');
    }
  };

  const handleKillBroker = () => {
    if (!liveState) return;
    const activeBrokers = Object.keys(liveState.brokers).filter(
      (id) => liveState.brokers[id]?.status === 'ALIVE',
    );
    if (activeBrokers.length === 0) return;

    const randomId = activeBrokers[Math.floor(Math.random() * activeBrokers.length)];
    if (clientRef.current && randomId) {
      clientRef.current.sendIntent('CHAOS_KILL_BROKER', { brokerId: randomId });
      addLocalLog(`Dispatched chaos intent: CRASH broker node ${randomId}`, 'WARN');
    }
  };

  const handleRecoverBroker = () => {
    if (!liveState) return;
    const crashedBrokers = Object.keys(liveState.brokers).filter(
      (id) => liveState.brokers[id]?.status === 'CRASHED',
    );
    if (crashedBrokers.length === 0) {
      addLocalLog('All brokers are currently ALIVE. No crashed node to recover.', 'INFO');
      return;
    }

    const randomId = crashedBrokers[Math.floor(Math.random() * crashedBrokers.length)];
    if (clientRef.current && randomId) {
      clientRef.current.sendIntent('CHAOS_RECOVER_BROKER', { brokerId: randomId });
      addLocalLog(`Dispatched recovery intent: RECOVER broker node ${randomId}`, 'INFO');
    }
  };

  const handleConsumerJoin = () => {
    if (clientRef.current) {
      clientRef.current.sendIntent('CONSUMER_JOIN', {
        groupId: 'order-processors',
        topics: ['orders'],
      });
      addLocalLog('Dispatched intent: CONSUMER_JOIN group "order-processors"', 'INFO');
    }
  };

  const handleConsumerLeave = () => {
    if (clientRef.current) {
      clientRef.current.sendIntent('CONSUMER_LEAVE', {
        groupId: 'order-processors',
      });
      addLocalLog('Dispatched intent: CONSUMER_LEAVE group "order-processors"', 'INFO');
    }
  };

  // Scrubbing handler
  const handleScrubChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const tickVal = parseInt(e.target.value, 10);
    setPlaybackTick(tickVal);

    const historicalState = stateHistory.find((s) => s.tick === tickVal);
    if (historicalState) {
      setRenderedState(historicalState);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0b0f19] text-[#f8fafc]">
      {/* 1. Header Bar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#334155] bg-[#121826]/90 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="flex h-3 w-3 relative">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                status === 'CONNECTED'
                  ? 'bg-[#10b981]'
                  : status === 'CONNECTING'
                    ? 'bg-[#f97316]'
                    : 'bg-[#ef4444]'
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-3 w-3 ${
                status === 'CONNECTED'
                  ? 'bg-[#10b981]'
                  : status === 'CONNECTING'
                    ? 'bg-[#f97316]'
                    : 'bg-[#ef4444]'
              }`}
            />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[#f8fafc]">
            TheVisualizer{' '}
            <span className="text-xs font-mono font-normal text-[#94a3b8]">
              v0.1.0 (Milestone 09)
            </span>
          </h1>
        </div>

        {/* Dynamic connection endpoint configs */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span className="text-[10px] text-[#94a3b8] font-mono">REST URL</span>
            <input
              type="text"
              value={restUrl}
              onChange={(e) => setRestUrl(e.target.value)}
              className="px-2 py-1 text-xs bg-[#1e293b] border border-[#334155] rounded text-white font-mono focus:outline-none w-44"
            />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-[#94a3b8] font-mono">WS URL</span>
            <input
              type="text"
              value={wsUrl}
              onChange={(e) => setWsUrl(e.target.value)}
              className="px-2 py-1 text-xs bg-[#1e293b] border border-[#334155] rounded text-white font-mono focus:outline-none w-44"
            />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-[#94a3b8] font-mono">ROOM ID</span>
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="px-2 py-1 text-xs bg-[#1e293b] border border-[#334155] rounded text-white font-mono focus:outline-none w-20"
            />
          </div>
          <button
            onClick={() => {
              void handleSandboxLogin();
            }}
            className="px-3 py-1.5 text-xs font-semibold bg-[#3b82f6]/20 hover:bg-[#3b82f6]/30 border border-[#3b82f6] text-[#3b82f6] rounded transition-all mt-3"
          >
            Sandbox Login
          </button>
          {status === 'CONNECTED' ? (
            <button
              onClick={handleDisconnect}
              className="px-3 py-1.5 text-xs font-semibold bg-[#ef4444]/20 hover:bg-[#ef4444]/30 border border-[#ef4444] text-[#ef4444] rounded transition-all mt-3"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={handleConnect}
              className="px-3 py-1.5 text-xs font-semibold bg-[#10b981]/20 hover:bg-[#10b981]/30 border border-[#10b981] text-[#10b981] rounded transition-all mt-3"
            >
              Connect Room
            </button>
          )}
        </div>
      </header>

      {/* 2. Main Section */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Control Deck (25%) */}
        <aside className="w-80 border-r border-[#334155] bg-[#121826]/40 p-5 flex flex-col gap-5 overflow-y-auto">
          {/* Simulation status metrics card */}
          <div className="border border-[#334155] bg-[#121826]/75 rounded-lg p-4">
            <h2 className="text-xs font-bold text-[#94a3b8] uppercase tracking-wider mb-3">
              Cluster Info
            </h2>
            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div>
                <div className="text-[10px] text-[#94a3b8]">Live Tick</div>
                <div className="text-base font-bold text-[#f8fafc]">
                  {String(liveState?.tick ?? 0)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-[#94a3b8]">Active Controllers</div>
                <div className="text-base font-bold text-[#eab308]">
                  {liveState?.kraft.activeControllerId ?? 'NONE'}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-[#94a3b8]">Alive Brokers</div>
                <div className="text-base font-bold text-[#10b981]">
                  {String(
                    Object.values(liveState?.brokers ?? {}).filter((b) => b.status === 'ALIVE')
                      .length,
                  )}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-[#94a3b8]">Crashed Brokers</div>
                <div className="text-base font-bold text-[#ef4444]">
                  {String(
                    Object.values(liveState?.brokers ?? {}).filter((b) => b.status === 'CRASHED')
                      .length,
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Client-side Scrubbing controls */}
          <div className="border border-[#334155] bg-[#121826]/75 rounded-lg p-4">
            <h2 className="text-xs font-bold text-[#94a3b8] uppercase tracking-wider mb-3">
              Playback Deck
            </h2>
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => setIsPaused(!isPaused)}
                className={`flex-1 py-1.5 text-xs font-semibold rounded border transition-all ${
                  isPaused
                    ? 'bg-[#10b981]/20 hover:bg-[#10b981]/30 border-[#10b981] text-[#10b981]'
                    : 'bg-[#f97316]/20 hover:bg-[#f97316]/30 border-[#f97316] text-[#f97316]'
                }`}
              >
                {isPaused ? '▶ Resume Live' : '❚❚ Pause Stream'}
              </button>
            </div>
            {isPaused && stateHistory.length > 1 && (
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-mono text-[#94a3b8]">
                  Scrubbing History (Tick {String(playbackTick)})
                </span>
                <input
                  type="range"
                  min={stateHistory[0]?.tick ?? 0}
                  max={stateHistory[stateHistory.length - 1]?.tick ?? 0}
                  value={playbackTick}
                  onChange={handleScrubChange}
                  className="w-full cursor-pointer accent-[#3b82f6]"
                />
                <div className="flex justify-between text-[8px] font-mono text-[#94a3b8]">
                  <span>Tick {String(stateHistory[0]?.tick ?? 0)}</span>
                  <span>Tick {String(stateHistory[stateHistory.length - 1]?.tick ?? 0)}</span>
                </div>
              </div>
            )}
          </div>

          {/* User intents dispatcher triggers */}
          <div className="border border-[#334155] bg-[#121826]/75 rounded-lg p-4 flex flex-col gap-3">
            <h2 className="text-xs font-bold text-[#94a3b8] uppercase tracking-wider mb-1">
              Interactive Deck
            </h2>

            <button
              onClick={handleProduceIntent}
              disabled={status !== 'CONNECTED' || isHalted}
              className="w-full py-2 text-xs font-semibold bg-[#3b82f6]/20 hover:bg-[#3b82f6]/30 border border-[#3b82f6] text-[#3b82f6] rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Produce Message (Topic: orders)
            </button>

            <button
              onClick={handleConsumerJoin}
              disabled={status !== 'CONNECTED' || isHalted}
              className="w-full py-2 text-xs font-semibold bg-[#a855f7]/20 hover:bg-[#a855f7]/30 border border-[#a855f7] text-[#a855f7] rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Start Consumer Instance
            </button>

            <button
              onClick={handleConsumerLeave}
              disabled={status !== 'CONNECTED' || isHalted}
              className="w-full py-2 text-xs font-semibold bg-[#64748b]/20 hover:bg-[#64748b]/30 border border-[#64748b] text-[#94a3b8] rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Stop Consumer Instance
            </button>

            <div className="border-t border-[#334155] my-1" />

            <button
              onClick={handleKillBroker}
              disabled={status !== 'CONNECTED' || isHalted}
              className="w-full py-2 text-xs font-semibold bg-[#ef4444]/20 hover:bg-[#ef4444]/30 border border-[#ef4444] text-[#ef4444] rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ⚡ Crash Random Broker (Chaos)
            </button>

            <button
              onClick={handleRecoverBroker}
              disabled={status !== 'CONNECTED' || isHalted}
              className="w-full py-2 text-xs font-semibold bg-[#10b981]/20 hover:bg-[#10b981]/30 border border-[#10b981] text-[#10b981] rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              🔧 Recover Crashed Broker
            </button>
          </div>
        </aside>

        {/* Center Visualizer Canvas (50%) */}
        <main className="flex-1 relative flex flex-col items-center justify-center p-6 bg-[#0b0f19]">
          <div className="w-full h-full relative border border-[#334155] rounded-xl bg-[#121826]/30 overflow-hidden shadow-2xl">
            <Visualizer state={renderedState} onHoverDetails={setHoverDetails} />

            {/* Float inspect card details */}
            {hoverDetails && (
              <div className="absolute top-4 left-4 border border-[#334155] bg-[#121826]/95 backdrop-blur-md rounded-lg p-4 shadow-xl z-10 w-72 text-xs code-font whitespace-pre-wrap pointer-events-none">
                {hoverDetails}
              </div>
            )}

            {/* Playback scrubbing watermark indicators */}
            {isPaused && (
              <div className="absolute top-4 right-4 bg-[#f97316]/20 border border-[#f97316] text-[#f97316] px-3 py-1 rounded text-xs font-bold uppercase tracking-wider font-mono">
                ❚❚ PAUSED (Scrubbing Tick {String(playbackTick)})
              </div>
            )}
          </div>
        </main>

        {/* Right Event stream log (25%) */}
        <aside className="w-80 border-l border-[#334155] bg-[#121826]/40 p-5 flex flex-col gap-5 overflow-hidden">
          <div className="flex flex-col flex-1 overflow-hidden">
            <h2 className="text-xs font-bold text-[#94a3b8] uppercase tracking-wider mb-3">
              Active Event Stream
            </h2>
            <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1 code-font text-[10px] select-text">
              {eventLogs.length === 0 ? (
                <div className="text-center text-[#64748b] mt-10">No events captured yet</div>
              ) : (
                eventLogs.map((log) => {
                  let badgeColor = 'text-[#94a3b8]';
                  if (log.type === 'SUCCESS') badgeColor = 'text-[#10b981]';
                  if (log.type === 'WARN') badgeColor = 'text-[#f97316]';
                  if (log.type === 'ERROR') badgeColor = 'text-[#ef4444]';

                  return (
                    <div key={log.id} className="border-b border-[#334155]/40 pb-2">
                      <div className="flex justify-between mb-1 text-[9px] text-[#64748b]">
                        <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                        <span className={`font-bold ${badgeColor}`}>{log.type}</span>
                      </div>
                      <div className="text-[#f8fafc] leading-relaxed break-words">
                        {log.message}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* 3. Safety Violation Warning panel overlay banner */}
      {isHalted && (
        <div className="bg-[#ef4444] text-white px-6 py-4 flex items-center justify-between font-mono font-bold text-sm tracking-wide shadow-2xl relative z-50">
          <div className="flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <span>
              CRITICAL SAFETY INVARIANT VIOLATION DETECTED:{' '}
              {haltError ?? 'Unknown protocol exception'}
            </span>
          </div>
          <button
            onClick={() => {
              setIsHalted(false);
              setHaltError(null);
              handleConnect(); // Restart and reset session
            }}
            className="px-4 py-1.5 bg-black hover:bg-black/80 text-white rounded border border-white/20 text-xs font-semibold uppercase tracking-wider transition-all"
          >
            Reset Session & Restart
          </button>
        </div>
      )}
    </div>
  );
}
