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

  // Playback controls
  const [isPaused, setIsPaused] = useState(false);
  const [playbackTick, setPlaybackTick] = useState(0);
  const [stateHistory, setStateHistory] = useState<KafkaClusterState[]>([]);

  // Safety halt state
  const [isHalted, setIsHalted] = useState(false);
  const [haltError, setHaltError] = useState<string | null>(null);

  const clientRef = useRef<WebSocketClient | null>(null);

  // Auto-authenticate on mount
  useEffect(() => {
    void handleSandboxLogin();
  }, []);

  // Update playback slider bounds when state changes
  useEffect(() => {
    if (!liveState) return;

    setStateHistory((prev) => {
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
        'Cannot connect: auth token is missing. Please click Auth Dev first.',
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
          return next.slice(0, 100);
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
      addLocalLog('Requesting developer credentials...', 'INFO');
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
        addLocalLog('Developer credentials loaded successfully.', 'SUCCESS');
      } else {
        throw new Error('No token found in response payload');
      }
    } catch (err: any) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      addLocalLog(`Credentials load failed: ${message}`, 'ERROR');
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
      addLocalLog('All brokers are ALIVE. No crashed node to recover.', 'INFO');
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
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#f8fafc] text-[#0f172a]">
      {/* 1. Header Navigation Bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-white z-20 shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-3 w-3 relative items-center justify-center">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                status === 'CONNECTED'
                  ? 'bg-[#10b981]'
                  : status === 'CONNECTING'
                    ? 'bg-[#f59e0b]'
                    : 'bg-[#ef4444]'
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                status === 'CONNECTED'
                  ? 'bg-[#10b981]'
                  : status === 'CONNECTING'
                    ? 'bg-[#f59e0b]'
                    : 'bg-[#ef4444]'
              }`}
            />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-[#0f172a]">TheVisualizer</h1>
        </div>

        {/* Endpoint Inputs and Controls */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 bg-[#f1f5f9] border border-slate-200 px-3 py-1.5 rounded-lg">
            <div className="flex flex-col">
              <span className="text-[9px] text-[#64748b] font-mono uppercase tracking-wider">REST Gateway</span>
              <input
                type="text"
                value={restUrl}
                onChange={(e) => setRestUrl(e.target.value)}
                className="modern-input border-none bg-transparent px-0 py-0 text-xs w-40 text-[#0f172a]"
              />
            </div>
            <div className="h-6 w-px bg-slate-300" />
            <div className="flex flex-col">
              <span className="text-[9px] text-[#64748b] font-mono uppercase tracking-wider">WS Tunnel</span>
              <input
                type="text"
                value={wsUrl}
                onChange={(e) => setWsUrl(e.target.value)}
                className="modern-input border-none bg-transparent px-0 py-0 text-xs w-40 text-[#0f172a]"
              />
            </div>
            <div className="h-6 w-px bg-slate-300" />
            <div className="flex flex-col">
              <span className="text-[9px] text-[#64748b] font-mono uppercase tracking-wider">Session Room</span>
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="modern-input border-none bg-transparent px-0 py-0 text-xs w-16 text-[#0f172a]"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                void handleSandboxLogin();
              }}
              className="btn-base btn-secondary"
            >
              Auth Dev
            </button>
            {status === 'CONNECTED' ? (
              <button onClick={handleDisconnect} className="btn-base btn-rose">
                Disconnect
              </button>
            ) : (
              <button onClick={handleConnect} className="btn-base btn-emerald">
                Connect Room
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 2. Main Workspace Layout */}
      <div className="flex flex-1 overflow-hidden p-4 gap-4 bg-[#f1f5f9]">
        {/* Left Sidebar */}
        <aside className="w-96 flex flex-col gap-4 overflow-y-auto shrink-0">
          
          {/* Cluster Summary Metrics Card */}
          <div className="card-panel p-4 flex flex-col gap-3">
            <h2 className="text-xs font-semibold text-[#64748b] uppercase tracking-wider">
              System Overview
            </h2>
            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="bg-[#f8fafc] p-2.5 rounded-lg border border-slate-200 flex flex-col gap-1">
                <span className="text-[10px] text-[#64748b]">Live Tick</span>
                <span className="text-base font-bold text-[#0f172a]">
                  {String(liveState?.tick ?? 0)}
                </span>
              </div>
              <div className="bg-[#f8fafc] p-2.5 rounded-lg border border-slate-200 flex flex-col gap-1">
                <span className="text-[10px] text-[#64748b]">Active Controller</span>
                <span className="text-base font-bold text-[#d97706]">
                  {liveState?.kraft.activeControllerId ?? 'NONE'}
                </span>
              </div>
              <div className="bg-[#f8fafc] p-2.5 rounded-lg border border-slate-200 flex flex-col gap-1">
                <span className="text-[10px] text-[#64748b]">Alive Brokers</span>
                <span className="text-base font-bold text-[#059669]">
                  {String(
                    Object.values(liveState?.brokers ?? {}).filter((b) => b.status === 'ALIVE').length,
                  )}
                </span>
              </div>
              <div className="bg-[#f8fafc] p-2.5 rounded-lg border border-slate-200 flex flex-col gap-1">
                <span className="text-[10px] text-[#64748b]">Crashed Nodes</span>
                <span className="text-base font-bold text-[#dc2626]">
                  {String(
                    Object.values(liveState?.brokers ?? {}).filter((b) => b.status === 'CRASHED').length,
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Simulation Commands Panel */}
          <div className="card-panel p-4 flex flex-col gap-3">
            <h2 className="text-xs font-semibold text-[#64748b] uppercase tracking-wider">
              Simulation Control
            </h2>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleProduceIntent}
                disabled={status !== 'CONNECTED' || isHalted}
                className="btn-base btn-primary w-full"
              >
                Produce Message (orders)
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleConsumerJoin}
                  disabled={status !== 'CONNECTED' || isHalted}
                  className="btn-base btn-indigo"
                >
                  Join Consumer
                </button>
                <button
                  onClick={handleConsumerLeave}
                  disabled={status !== 'CONNECTED' || isHalted}
                  className="btn-base btn-secondary"
                >
                  Leave Consumer
                </button>
              </div>
            </div>
          </div>

          {/* Chaos Testing Panel */}
          <div className="card-panel p-4 flex flex-col gap-3">
            <h2 className="text-xs font-semibold text-[#64748b] uppercase tracking-wider">
              Chaos Laboratory
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleKillBroker}
                disabled={status !== 'CONNECTED' || isHalted}
                className="btn-base btn-rose"
              >
                Crash Broker
              </button>
              <button
                onClick={handleRecoverBroker}
                disabled={status !== 'CONNECTED' || isHalted}
                className="btn-base btn-emerald"
              >
                Recover Broker
              </button>
            </div>
          </div>

          {/* Playback Scrubbing Deck */}
          <div className="card-panel p-4 flex flex-col gap-3 mt-auto">
            <h2 className="text-xs font-semibold text-[#64748b] uppercase tracking-wider">
              Playback Scrubber
            </h2>
            <button
              onClick={() => setIsPaused(!isPaused)}
              className={`btn-base w-full ${isPaused ? 'btn-emerald' : 'btn-secondary'}`}
            >
              {isPaused ? '▶ Resume Live Stream' : '❚❚ Pause Stream'}
            </button>
            {isPaused && stateHistory.length > 1 && (
              <div className="flex flex-col gap-2 pt-2 border-t border-slate-200">
                <div className="flex justify-between text-xs font-mono text-[#64748b]">
                  <span>Timeline</span>
                  <span className="text-[#2563eb]">Tick {String(playbackTick)}</span>
                </div>
                <input
                  type="range"
                  min={stateHistory[0]?.tick ?? 0}
                  max={stateHistory[stateHistory.length - 1]?.tick ?? 0}
                  value={playbackTick}
                  onChange={handleScrubChange}
                  className="w-full cursor-pointer accent-[#2563eb]"
                />
                <div className="flex justify-between text-[10px] font-mono text-[#64748b]">
                  <span>Tick {String(stateHistory[0]?.tick ?? 0)}</span>
                  <span>Tick {String(stateHistory[stateHistory.length - 1]?.tick ?? 0)}</span>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Center Main Canvas */}
        <main className="flex-1 relative card-panel p-2 overflow-hidden flex flex-col justify-center items-center bg-white">
          <Visualizer state={renderedState} onHoverDetails={setHoverDetails} />

          {/* Inspect Hover Card */}
          {hoverDetails && (
            <div className="absolute top-4 left-4 card-panel p-4 z-30 w-80 text-xs code-font whitespace-pre-wrap pointer-events-none border-l-4 border-l-[#2563eb] leading-relaxed shadow-lg bg-white/95">
              {hoverDetails}
            </div>
          )}

          {/* Scrubbing Banner */}
          {isPaused && (
            <div className="absolute top-4 right-4 bg-amber-50 border border-amber-200 text-amber-800 px-3.5 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider font-mono shadow-md">
              ❚❚ PAUSED (Scrubbing Tick {String(playbackTick)})
            </div>
          )}
        </main>

        {/* Right Sidebar - Event Stream */}
        <aside className="w-80 card-panel p-4 flex flex-col gap-3 shrink-0 overflow-hidden bg-white">
          <h2 className="text-xs font-semibold text-[#64748b] uppercase tracking-wider">
            Event Log Stream
          </h2>
          <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1 code-font text-[11px] select-text">
            {eventLogs.length === 0 ? (
              <div className="text-center text-[#64748b] mt-10">No events captured</div>
            ) : (
              eventLogs.map((log) => {
                let badgeColor = 'text-[#64748b] bg-slate-100';
                let logBorder = 'border-slate-200';
                if (log.type === 'SUCCESS') {
                  badgeColor = 'text-[#047857] bg-[#ecfdf5]';
                  logBorder = 'border-[#a7f3d0]';
                }
                if (log.type === 'WARN') {
                  badgeColor = 'text-[#b45309] bg-[#fffbeb]';
                  logBorder = 'border-[#fde68a]';
                }
                if (log.type === 'ERROR') {
                  badgeColor = 'text-[#be123c] bg-[#fff1f2]';
                  logBorder = 'border-[#fecdd3]';
                }

                return (
                  <div key={log.id} className={`border bg-[#f8fafc] rounded-lg p-2.5 flex flex-col gap-1.5 ${logBorder}`}>
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-[#64748b]">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded font-semibold text-[9px] ${badgeColor}`}>
                        {log.type}
                      </span>
                    </div>
                    <div className="text-[#0f172a] leading-relaxed break-words">
                      {log.message}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      </div>

      {/* Safety Violation Alert Overlay */}
      {isHalted && (
        <div className="bg-[#ef4444] text-white px-6 py-3.5 flex items-center justify-between font-mono font-bold text-xs tracking-wide shadow-2xl relative z-50">
          <div className="flex items-center gap-3">
            <span className="text-base">⚠️</span>
            <span>
              CRITICAL INVARIANT VIOLATION: {haltError ?? 'Protocol Exception'}
            </span>
          </div>
          <button
            onClick={() => {
              setIsHalted(false);
              setHaltError(null);
              handleConnect();
            }}
            className="px-3.5 py-1.5 bg-white text-slate-900 rounded border border-white/20 text-xs font-semibold uppercase tracking-wider transition-all"
          >
            Reset Session
          </button>
        </div>
      )}
    </div>
  );
}
