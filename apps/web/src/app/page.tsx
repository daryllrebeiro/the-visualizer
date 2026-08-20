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

  useEffect(() => {
    void handleSandboxLogin();
  }, []);

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

  const handleConnect = () => {
    if (clientRef.current) {
      clientRef.current.disconnect();
    }

    if (!token) {
      addLocalLog(
        'Cannot connect: auth token missing. Click Auth Dev.',
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

  const handleScrubChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const tickVal = parseInt(e.target.value, 10);
    setPlaybackTick(tickVal);

    const historicalState = stateHistory.find((s) => s.tick === tickVal);
    if (historicalState) {
      setRenderedState(historicalState);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#f1f5f9] text-[#1e293b] text-center">
      {/* 1. Header Navigation Bar */}
      <header className="flex items-center justify-between px-8 py-3.5 border-b border-slate-300 bg-white shadow-sm z-20 shrink-0">
        <div className="flex items-center justify-center gap-3">
          <div className="flex h-3.5 w-3.5 relative items-center justify-center">
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
              className={`relative inline-flex rounded-full h-3 w-3 ${
                status === 'CONNECTED'
                  ? 'bg-[#10b981]'
                  : status === 'CONNECTING'
                    ? 'bg-[#f59e0b]'
                    : 'bg-[#ef4444]'
              }`}
            />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[#0f172a] text-center">
            TheVisualizer
          </h1>
        </div>

        {/* Center-Aligned Endpoint Configs */}
        <div className="flex items-center justify-center gap-5">
          <div className="flex items-center justify-center gap-4 bg-[#f8fafc] border border-slate-300 px-4 py-1.5 rounded-xl shadow-inner">
            <div className="flex flex-col items-center justify-center">
              <span className="text-[10px] text-[#64748b] font-mono uppercase tracking-wider font-semibold text-center">
                REST Gateway
              </span>
              <input
                type="text"
                value={restUrl}
                onChange={(e) => setRestUrl(e.target.value)}
                className="modern-input border-none bg-transparent px-1 py-0.5 text-xs w-36 font-semibold text-center"
              />
            </div>
            <div className="h-6 w-px bg-slate-300" />
            <div className="flex flex-col items-center justify-center">
              <span className="text-[10px] text-[#64748b] font-mono uppercase tracking-wider font-semibold text-center">
                WS Tunnel
              </span>
              <input
                type="text"
                value={wsUrl}
                onChange={(e) => setWsUrl(e.target.value)}
                className="modern-input border-none bg-transparent px-1 py-0.5 text-xs w-36 font-semibold text-center"
              />
            </div>
            <div className="h-6 w-px bg-slate-300" />
            <div className="flex flex-col items-center justify-center">
              <span className="text-[10px] text-[#64748b] font-mono uppercase tracking-wider font-semibold text-center">
                Session Room
              </span>
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="modern-input border-none bg-transparent px-1 py-0.5 text-xs w-16 font-semibold text-center"
              />
            </div>
          </div>

          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => {
                void handleSandboxLogin();
              }}
              className="btn-base btn-secondary px-4"
            >
              Auth Dev
            </button>
            {status === 'CONNECTED' ? (
              <button onClick={handleDisconnect} className="btn-base btn-rose px-4">
                Disconnect
              </button>
            ) : (
              <button onClick={handleConnect} className="btn-base btn-emerald px-4">
                Connect Room
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 2. Main Workspace Layout */}
      <div className="flex flex-1 overflow-hidden p-5 gap-5 bg-[#f1f5f9]">
        {/* Left Sidebar */}
        <aside className="w-96 flex flex-col gap-4 overflow-y-auto shrink-0 pr-1">
          
          {/* Pastel Yellow Card: System Overview */}
          <div className="card-panel p-5 flex flex-col items-center justify-center gap-4 bg-[#fef9c3]">
            <h2 className="text-xs font-bold text-[#854d0e] uppercase tracking-wider text-center">
              System Overview
            </h2>
            <div className="grid grid-cols-2 gap-3 w-full text-xs font-mono">
              <div className="bg-white/90 p-3 rounded-xl border border-yellow-200 flex flex-col items-center justify-center gap-1 shadow-sm text-center">
                <span className="text-[10px] text-[#854d0e] font-semibold text-center">Live Tick</span>
                <span className="text-base font-bold text-[#713f12] text-center">
                  {String(liveState?.tick ?? 0)}
                </span>
              </div>
              <div className="bg-white/90 p-3 rounded-xl border border-yellow-200 flex flex-col items-center justify-center gap-1 shadow-sm text-center">
                <span className="text-[10px] text-[#854d0e] font-semibold text-center">Active Controller</span>
                <span className="text-base font-bold text-[#b45309] text-center">
                  {liveState?.kraft.activeControllerId ?? 'NONE'}
                </span>
              </div>
              <div className="bg-white/90 p-3 rounded-xl border border-yellow-200 flex flex-col items-center justify-center gap-1 shadow-sm text-center">
                <span className="text-[10px] text-[#854d0e] font-semibold text-center">Alive Brokers</span>
                <span className="text-base font-bold text-[#047857] text-center">
                  {String(
                    Object.values(liveState?.brokers ?? {}).filter((b) => b.status === 'ALIVE').length,
                  )}
                </span>
              </div>
              <div className="bg-white/90 p-3 rounded-xl border border-yellow-200 flex flex-col items-center justify-center gap-1 shadow-sm text-center">
                <span className="text-[10px] text-[#854d0e] font-semibold text-center">Crashed Nodes</span>
                <span className="text-base font-bold text-[#be123c] text-center">
                  {String(
                    Object.values(liveState?.brokers ?? {}).filter((b) => b.status === 'CRASHED').length,
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Pastel Blue Card: Simulation Control */}
          <div className="card-panel p-5 flex flex-col items-center justify-center gap-4 bg-[#dbeafe]">
            <h2 className="text-xs font-bold text-[#1e40af] uppercase tracking-wider text-center">
              Simulation Control
            </h2>
            {/* All Buttons in Single Horizontal Row with Spacing */}
            <div className="flex items-center justify-center gap-3 w-full px-2 py-1">
              <button
                onClick={handleProduceIntent}
                disabled={status !== 'CONNECTED' || isHalted}
                className="btn-base btn-primary flex-1"
              >
                Produce Message
              </button>
              <button
                onClick={handleConsumerJoin}
                disabled={status !== 'CONNECTED' || isHalted}
                className="btn-base btn-indigo flex-1"
              >
                Join Consumer
              </button>
              <button
                onClick={handleConsumerLeave}
                disabled={status !== 'CONNECTED' || isHalted}
                className="btn-base btn-secondary flex-1"
              >
                Leave Consumer
              </button>
            </div>
          </div>

          {/* Pastel Pink Card: Chaos Laboratory */}
          <div className="card-panel p-5 flex flex-col items-center justify-center gap-4 bg-[#ffe4e6]">
            <h2 className="text-xs font-bold text-[#9f1239] uppercase tracking-wider text-center">
              Chaos Laboratory
            </h2>
            {/* All Buttons in Single Horizontal Row with Spacing */}
            <div className="flex items-center justify-center gap-3 w-full px-2 py-1">
              <button
                onClick={handleKillBroker}
                disabled={status !== 'CONNECTED' || isHalted}
                className="btn-base btn-rose flex-1"
              >
                Crash Broker
              </button>
              <button
                onClick={handleRecoverBroker}
                disabled={status !== 'CONNECTED' || isHalted}
                className="btn-base btn-emerald flex-1"
              >
                Recover Broker
              </button>
            </div>
          </div>

          {/* Pastel Light Green Card: Playback Scrubber */}
          <div className="card-panel p-5 flex flex-col items-center justify-center gap-4 bg-[#dcfce7] mt-auto">
            <h2 className="text-xs font-bold text-[#166534] uppercase tracking-wider text-center">
              Playback Scrubber
            </h2>
            <div className="w-full px-2 py-1 flex justify-center">
              <button
                onClick={() => setIsPaused(!isPaused)}
                className={`btn-base w-full ${isPaused ? 'btn-emerald' : 'btn-secondary'}`}
              >
                {isPaused ? '▶ Resume Stream' : '❚❚ Pause Stream'}
              </button>
            </div>
            {isPaused && stateHistory.length > 1 && (
              <div className="flex flex-col items-center justify-center gap-2 pt-3 border-t border-emerald-300 w-full px-2">
                <div className="flex justify-between w-full text-xs font-mono text-[#166534] font-semibold text-center">
                  <span>Timeline</span>
                  <span>Tick {String(playbackTick)}</span>
                </div>
                <input
                  type="range"
                  min={stateHistory[0]?.tick ?? 0}
                  max={stateHistory[stateHistory.length - 1]?.tick ?? 0}
                  value={playbackTick}
                  onChange={handleScrubChange}
                  className="w-full cursor-pointer accent-[#059669]"
                />
                <div className="flex justify-between w-full text-[10px] font-mono text-[#15803d]">
                  <span>Tick {String(stateHistory[0]?.tick ?? 0)}</span>
                  <span>Tick {String(stateHistory[stateHistory.length - 1]?.tick ?? 0)}</span>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Center Main Canvas Panel */}
        <main className="flex-1 relative card-panel p-4 overflow-hidden flex flex-col justify-center items-center bg-white shadow-md">
          <Visualizer state={renderedState} onHoverDetails={setHoverDetails} />

          {/* Inspect Hover Card */}
          {hoverDetails && (
            <div className="absolute top-6 left-6 card-panel p-5 z-30 w-80 text-xs code-font whitespace-pre-wrap pointer-events-none border-l-4 border-l-[#2563eb] leading-relaxed shadow-xl bg-white/95 text-center">
              {hoverDetails}
            </div>
          )}

          {/* Scrubbing Banner */}
          {isPaused && (
            <div className="absolute top-6 right-6 bg-yellow-100 border border-yellow-400 text-yellow-900 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider font-mono shadow-md text-center">
              ❚❚ PAUSED (Scrubbing Tick {String(playbackTick)})
            </div>
          )}
        </main>

        {/* Right Sidebar - Pastel Purple Event Log Stream */}
        <aside className="w-80 card-panel p-5 flex flex-col items-center gap-4 shrink-0 overflow-hidden bg-[#f3e8ff]">
          <h2 className="text-xs font-bold text-[#6b21a8] uppercase tracking-wider text-center">
            Event Log Stream
          </h2>
          <div className="flex-1 w-full overflow-y-auto flex flex-col items-center gap-2.5 pr-1 code-font text-[11px] select-text">
            {eventLogs.length === 0 ? (
              <div className="text-center text-[#7e22ce] mt-12 font-semibold">
                No events captured
              </div>
            ) : (
              eventLogs.map((log) => {
                let badgeColor = 'text-[#475569] bg-slate-200';
                let logBorder = 'border-purple-200';
                if (log.type === 'SUCCESS') {
                  badgeColor = 'text-[#047857] bg-[#dcfce7]';
                  logBorder = 'border-emerald-300';
                }
                if (log.type === 'WARN') {
                  badgeColor = 'text-[#b45309] bg-[#fef9c3]';
                  logBorder = 'border-yellow-300';
                }
                if (log.type === 'ERROR') {
                  badgeColor = 'text-[#be123c] bg-[#ffe4e6]';
                  logBorder = 'border-rose-300';
                }

                return (
                  <div
                    key={log.id}
                    className={`border bg-white rounded-xl p-2.5 w-full flex flex-col items-center gap-1.5 shadow-sm text-center ${logBorder}`}
                  >
                    <div className="flex justify-between items-center w-full text-[10px]">
                      <span className="text-[#64748b]">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full font-bold text-[9px] ${badgeColor}`}
                      >
                        {log.type}
                      </span>
                    </div>
                    <div className="text-[#1e293b] leading-relaxed break-words text-center font-medium">
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
        <div className="bg-[#be123c] text-white px-8 py-3.5 flex items-center justify-between font-mono font-bold text-xs tracking-wide shadow-2xl relative z-50">
          <div className="flex items-center justify-center gap-3">
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
            className="px-4 py-2 bg-white text-[#be123c] rounded-lg border border-white/20 text-xs font-bold uppercase tracking-wider transition-all"
          >
            Reset Session
          </button>
        </div>
      )}
    </div>
  );
}
