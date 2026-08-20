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
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0f172a] text-[#f8fafc]">
      {/* 1. Header Navigation Bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-white/10 bg-[#1e293b]/80 backdrop-blur-md z-20 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-3 w-3 relative items-center justify-center">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                status === 'CONNECTED'
                  ? 'bg-[#34d399]'
                  : status === 'CONNECTING'
                    ? 'bg-[#fbbf24]'
                    : 'bg-[#f87171]'
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                status === 'CONNECTED'
                  ? 'bg-[#34d399]'
                  : status === 'CONNECTING'
                    ? 'bg-[#fbbf24]'
                    : 'bg-[#f87171]'
              }`}
            />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-white">TheVisualizer</h1>
        </div>

        {/* Endpoint Inputs and Controls */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 bg-[#0f172a]/60 border border-white/10 px-3 py-1.5 rounded-lg">
            <div className="flex flex-col">
              <span className="text-[9px] text-[#94a3b8] font-mono uppercase tracking-wider">REST Gateway</span>
              <input
                type="text"
                value={restUrl}
                onChange={(e) => setRestUrl(e.target.value)}
                className="modern-input border-none bg-transparent px-0 py-0 text-xs w-40"
              />
            </div>
            <div className="h-6 w-px bg-white/10" />
            <div className="flex flex-col">
              <span className="text-[9px] text-[#94a3b8] font-mono uppercase tracking-wider">WS Tunnel</span>
              <input
                type="text"
                value={wsUrl}
                onChange={(e) => setWsUrl(e.target.value)}
                className="modern-input border-none bg-transparent px-0 py-0 text-xs w-40"
              />
            </div>
            <div className="h-6 w-px bg-white/10" />
            <div className="flex flex-col">
              <span className="text-[9px] text-[#94a3b8] font-mono uppercase tracking-wider">Session Room</span>
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="modern-input border-none bg-transparent px-0 py-0 text-xs w-16"
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
      <div className="flex flex-1 overflow-hidden p-4 gap-4">
        {/* Left Sidebar - Full Vertical Spacing */}
        <aside className="w-96 flex flex-col gap-4 overflow-y-auto shrink-0">
          
          {/* Cluster Summary Metrics Card */}
          <div className="card-panel p-4 flex flex-col gap-3">
            <h2 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider">
              System Overview
            </h2>
            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="bg-[#0f172a]/50 p-2.5 rounded-lg border border-white/5 flex flex-col gap-1">
                <span className="text-[10px] text-[#94a3b8]">Live Tick</span>
                <span className="text-base font-bold text-white">
                  {String(liveState?.tick ?? 0)}
                </span>
              </div>
              <div className="bg-[#0f172a]/50 p-2.5 rounded-lg border border-white/5 flex flex-col gap-1">
                <span className="text-[10px] text-[#94a3b8]">Active Controller</span>
                <span className="text-base font-bold text-[#fbbf24]">
                  {liveState?.kraft.activeControllerId ?? 'NONE'}
                </span>
              </div>
              <div className="bg-[#0f172a]/50 p-2.5 rounded-lg border border-white/5 flex flex-col gap-1">
                <span className="text-[10px] text-[#94a3b8]">Alive Brokers</span>
                <span className="text-base font-bold text-[#34d399]">
                  {String(
                    Object.values(liveState?.brokers ?? {}).filter((b) => b.status === 'ALIVE').length,
                  )}
                </span>
              </div>
              <div className="bg-[#0f172a]/50 p-2.5 rounded-lg border border-white/5 flex flex-col gap-1">
                <span className="text-[10px] text-[#94a3b8]">Crashed Nodes</span>
                <span className="text-base font-bold text-[#f87171]">
                  {String(
                    Object.values(liveState?.brokers ?? {}).filter((b) => b.status === 'CRASHED').length,
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Simulation Commands Panel */}
          <div className="card-panel p-4 flex flex-col gap-3">
            <h2 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider">
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
            <h2 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider">
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
            <h2 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider">
              Playback Scrubber
            </h2>
            <button
              onClick={() => setIsPaused(!isPaused)}
              className={`btn-base w-full ${isPaused ? 'btn-emerald' : 'btn-secondary'}`}
            >
              {isPaused ? '▶ Resume Live Stream' : '❚❚ Pause Stream'}
            </button>
            {isPaused && stateHistory.length > 1 && (
              <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
                <div className="flex justify-between text-xs font-mono text-[#94a3b8]">
                  <span>Timeline</span>
                  <span className="text-[#38bdf8]">Tick {String(playbackTick)}</span>
                </div>
                <input
                  type="range"
                  min={stateHistory[0]?.tick ?? 0}
                  max={stateHistory[stateHistory.length - 1]?.tick ?? 0}
                  value={playbackTick}
                  onChange={handleScrubChange}
                  className="w-full cursor-pointer accent-[#38bdf8]"
                />
                <div className="flex justify-between text-[10px] font-mono text-[#64748b]">
                  <span>Tick {String(stateHistory[0]?.tick ?? 0)}</span>
                  <span>Tick {String(stateHistory[stateHistory.length - 1]?.tick ?? 0)}</span>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Center Main Canvas - Fills Viewport Completely */}
        <main className="flex-1 relative card-panel p-2 overflow-hidden flex flex-col justify-center items-center">
          <Visualizer state={renderedState} onHoverDetails={setHoverDetails} />

          {/* Inspect Hover Card */}
          {hoverDetails && (
            <div className="absolute top-4 left-4 card-panel p-4 z-30 w-80 text-xs code-font whitespace-pre-wrap pointer-events-none border-l-4 border-l-[#38bdf8] leading-relaxed shadow-xl">
              {hoverDetails}
            </div>
          )}

          {/* Scrubbing Banner */}
          {isPaused && (
            <div className="absolute top-4 right-4 bg-[#1e293b]/90 border border-[#fbbf24]/40 text-[#fbbf24] px-3.5 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider font-mono backdrop-blur-md shadow-lg">
              ❚❚ PAUSED (Scrubbing Tick {String(playbackTick)})
            </div>
          )}
        </main>

        {/* Right Sidebar - Event Stream */}
        <aside className="w-80 card-panel p-4 flex flex-col gap-3 shrink-0 overflow-hidden">
          <h2 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider">
            Event Log Stream
          </h2>
          <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1 code-font text-[11px] select-text">
            {eventLogs.length === 0 ? (
              <div className="text-center text-[#64748b] mt-10">No events captured</div>
            ) : (
              eventLogs.map((log) => {
                let badgeColor = 'text-[#94a3b8] bg-white/5';
                let logBorder = 'border-white/5';
                if (log.type === 'SUCCESS') {
                  badgeColor = 'text-[#34d399] bg-[#34d399]/10';
                  logBorder = 'border-[#34d399]/20';
                }
                if (log.type === 'WARN') {
                  badgeColor = 'text-[#fbbf24] bg-[#fbbf24]/10';
                  logBorder = 'border-[#fbbf24]/20';
                }
                if (log.type === 'ERROR') {
                  badgeColor = 'text-[#f87171] bg-[#f87171]/10';
                  logBorder = 'border-[#f87171]/20';
                }

                return (
                  <div key={log.id} className={`border bg-[#0f172a]/40 rounded-lg p-2.5 flex flex-col gap-1.5 ${logBorder}`}>
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-[#64748b]">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded font-semibold text-[9px] ${badgeColor}`}>
                        {log.type}
                      </span>
                    </div>
                    <div className="text-[#f8fafc] leading-relaxed break-words">
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
        <div className="bg-[#f87171] text-slate-900 px-6 py-3.5 flex items-center justify-between font-mono font-bold text-xs tracking-wide shadow-2xl relative z-50">
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
            className="px-3.5 py-1.5 bg-slate-900 text-white rounded border border-white/20 text-xs font-semibold uppercase tracking-wider transition-all"
          >
            Reset Session
          </button>
        </div>
      )}
    </div>
  );
}
