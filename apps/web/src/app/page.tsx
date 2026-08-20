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

  // Accordion active sections
  const [activeSections, setActiveSections] = useState({
    setup: true,
    simulation: true,
    chaos: true,
  });

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

  const toggleSection = (section: keyof typeof activeSections) => {
    setActiveSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#090d16] text-[#f1f5f9]">
      {/* Header Bar */}
      <header className="flex items-center justify-between px-6 py-3.5 border-b border-white/5 bg-[#0f1422]/90 backdrop-blur-md z-10 shadow-md">
        <div className="flex items-center gap-3">
          <div className="flex h-2.5 w-2.5 relative">
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
              className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                status === 'CONNECTED'
                  ? 'bg-[#10b981]'
                  : status === 'CONNECTING'
                    ? 'bg-[#f97316]'
                    : 'bg-[#ef4444]'
              }`}
            />
          </div>
          <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
            TheVisualizer
          </h1>
        </div>

        {/* Dynamic connection endpoint configs */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 bg-[#161e2e]/50 border border-white/5 px-3 py-1.5 rounded-lg">
            <div className="flex flex-col">
              <span className="text-[8px] text-[#94a3b8] font-mono tracking-wider">REST GATEWAY</span>
              <input
                type="text"
                value={restUrl}
                onChange={(e) => setRestUrl(e.target.value)}
                className="modern-input px-1.5 py-0.5 w-36 border-none bg-transparent"
              />
            </div>
            <div className="h-6 w-px bg-white/5" />
            <div className="flex flex-col">
              <span className="text-[8px] text-[#94a3b8] font-mono tracking-wider">WS TUNNEL</span>
              <input
                type="text"
                value={wsUrl}
                onChange={(e) => setWsUrl(e.target.value)}
                className="modern-input px-1.5 py-0.5 w-36 border-none bg-transparent"
              />
            </div>
            <div className="h-6 w-px bg-white/5" />
            <div className="flex flex-col">
              <span className="text-[8px] text-[#94a3b8] font-mono tracking-wider">SESSION ROOM</span>
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="modern-input px-1.5 py-0.5 w-16 border-none bg-transparent"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                void handleSandboxLogin();
              }}
              className="btn-base btn-secondary px-3 py-1.5"
            >
              🔒 Auth Dev
            </button>
            {status === 'CONNECTED' ? (
              <button
                onClick={handleDisconnect}
                className="btn-base btn-danger px-3 py-1.5 font-semibold"
              >
                Disconnect
              </button>
            ) : (
              <button
                onClick={handleConnect}
                className="btn-base btn-success px-3 py-1.5 font-semibold"
              >
                Connect Room
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Panel Grid */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar (Control Deck) */}
        <aside className="w-80 border-r border-white/5 bg-[#0f1422]/30 p-4 flex flex-col gap-4 overflow-y-auto z-10">
          
          {/* Section 1: Connection & Cluster Info */}
          <div className="glass-panel p-3.5">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => toggleSection('setup')}
            >
              <h2 className="text-xs font-bold text-[#94a3b8] uppercase tracking-wider">
                System Overview
              </h2>
              <span className="text-xs text-[#64748b]">
                {activeSections.setup ? '▼' : '▶'}
              </span>
            </div>

            {activeSections.setup && (
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs font-mono border-t border-white/5 pt-3">
                <div className="bg-[#161e2e]/50 p-2 rounded border border-white/5">
                  <div className="text-[9px] text-[#94a3b8] mb-0.5">Live Tick</div>
                  <div className="text-sm font-bold text-white">
                    {String(liveState?.tick ?? 0)}
                  </div>
                </div>
                <div className="bg-[#161e2e]/50 p-2 rounded border border-white/5">
                  <div className="text-[9px] text-[#94a3b8] mb-0.5">Active Controller</div>
                  <div className="text-sm font-bold text-[#eab308]">
                    {liveState?.kraft.activeControllerId ?? 'NONE'}
                  </div>
                </div>
                <div className="bg-[#161e2e]/50 p-2 rounded border border-white/5">
                  <div className="text-[9px] text-[#94a3b8] mb-0.5">Alive Brokers</div>
                  <div className="text-sm font-bold text-[#10b981]">
                    {String(
                      Object.values(liveState?.brokers ?? {}).filter((b) => b.status === 'ALIVE')
                        .length,
                    )}
                  </div>
                </div>
                <div className="bg-[#161e2e]/50 p-2 rounded border border-white/5">
                  <div className="text-[9px] text-[#94a3b8] mb-0.5">Crashed Nodes</div>
                  <div className="text-sm font-bold text-[#ef4444]">
                    {String(
                      Object.values(liveState?.brokers ?? {}).filter((b) => b.status === 'CRASHED')
                        .length,
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Production & Consumption */}
          <div className="glass-panel p-3.5">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => toggleSection('simulation')}
            >
              <h2 className="text-xs font-bold text-[#94a3b8] uppercase tracking-wider">
                Simulation Lab
              </h2>
              <span className="text-xs text-[#64748b]">
                {activeSections.simulation ? '▼' : '▶'}
              </span>
            </div>

            {activeSections.simulation && (
              <div className="mt-3 flex flex-col gap-2 border-t border-white/5 pt-3">
                <button
                  onClick={handleProduceIntent}
                  disabled={status !== 'CONNECTED' || isHalted}
                  className="btn-base btn-primary w-full py-2"
                >
                  🚀 Produce Msg (orders)
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleConsumerJoin}
                    disabled={status !== 'CONNECTED' || isHalted}
                    className="btn-base btn-purple w-full py-2"
                  >
                    + Join Consumer
                  </button>
                  <button
                    onClick={handleConsumerLeave}
                    disabled={status !== 'CONNECTED' || isHalted}
                    className="btn-base btn-secondary w-full py-2"
                  >
                    - Leave Consumer
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Chaos Laboratory */}
          <div className="glass-panel p-3.5">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => toggleSection('chaos')}
            >
              <h2 className="text-xs font-bold text-[#94a3b8] uppercase tracking-wider">
                Chaos Laboratory
              </h2>
              <span className="text-xs text-[#64748b]">
                {activeSections.chaos ? '▼' : '▶'}
              </span>
            </div>

            {activeSections.chaos && (
              <div className="mt-3 flex flex-col gap-2 border-t border-white/5 pt-3">
                <button
                  onClick={handleKillBroker}
                  disabled={status !== 'CONNECTED' || isHalted}
                  className="btn-base btn-danger w-full py-2"
                >
                  ⚡ Crash Random Broker
                </button>
                <button
                  onClick={handleRecoverBroker}
                  disabled={status !== 'CONNECTED' || isHalted}
                  className="btn-base btn-success w-full py-2"
                >
                  🔧 Recover Broker
                </button>
              </div>
            )}
          </div>

          {/* Section 4: Playback History Deck */}
          <div className="glass-panel p-3.5 mt-auto">
            <h2 className="text-xs font-bold text-[#94a3b8] uppercase tracking-wider mb-3">
              Playback Scrubber
            </h2>
            <button
              onClick={() => setIsPaused(!isPaused)}
              className={`btn-base w-full py-2 mb-3 ${
                isPaused ? 'btn-success' : 'btn-warning'
              }`}
            >
              {isPaused ? '▶ Resume Live Stream' : '❚❚ Pause Simulation'}
            </button>
            {isPaused && stateHistory.length > 1 && (
              <div className="flex flex-col gap-2 border-t border-white/5 pt-3">
                <div className="flex justify-between text-[9px] font-mono text-[#94a3b8]">
                  <span>Timeline</span>
                  <span className="text-[#3b82f6]">Tick {String(playbackTick)}</span>
                </div>
                <input
                  type="range"
                  min={stateHistory[0]?.tick ?? 0}
                  max={stateHistory[stateHistory.length - 1]?.tick ?? 0}
                  value={playbackTick}
                  onChange={handleScrubChange}
                  className="w-full cursor-pointer accent-[#3b82f6]"
                />
                <div className="flex justify-between text-[8px] font-mono text-[#64748b]">
                  <span>Start ({String(stateHistory[0]?.tick ?? 0)})</span>
                  <span>End ({String(stateHistory[stateHistory.length - 1]?.tick ?? 0)})</span>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Center Panel (Visualizer Canvas) */}
        <main className="flex-1 relative flex flex-col items-center justify-center p-5 bg-[#090d16]">
          <div className="w-full h-full relative border border-white/5 rounded-2xl bg-[#0f1422]/20 overflow-hidden shadow-2xl">
            <Visualizer state={renderedState} onHoverDetails={setHoverDetails} />

            {/* Float inspect card details */}
            {hoverDetails && (
              <div className="absolute top-4 left-4 border border-white/10 bg-[#0f1422]/95 backdrop-blur-md rounded-xl p-4 shadow-xl z-20 w-80 text-xs code-font whitespace-pre-wrap pointer-events-none border-l-4 border-l-[#3b82f6] leading-relaxed">
                {hoverDetails}
              </div>
            )}

            {/* Playback scrubbing watermark indicators */}
            {isPaused && (
              <div className="absolute top-4 right-4 bg-[#f97316]/10 border border-[#f97316]/30 text-[#f97316] px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider font-mono backdrop-blur-md shadow-lg animate-pulse">
                ❚❚ PAUSED (Scrubbing Tick {String(playbackTick)})
              </div>
            )}
          </div>
        </main>

        {/* Right Sidebar (Event Logs Feed) */}
        <aside className="w-80 border-l border-white/5 bg-[#0f1422]/30 p-4 flex flex-col gap-4 overflow-hidden z-10">
          <div className="flex flex-col flex-1 overflow-hidden">
            <h2 className="text-xs font-bold text-[#94a3b8] uppercase tracking-wider mb-3">
              Event Log Timeline
            </h2>
            <div className="flex-1 overflow-y-auto flex flex-col gap-2.5 pr-1 code-font text-[10px] select-text">
              {eventLogs.length === 0 ? (
                <div className="text-center text-[#64748b] mt-10">No events captured yet</div>
              ) : (
                eventLogs.map((log) => {
                  let badgeColor = 'text-[#94a3b8] bg-white/5';
                  let logBorder = 'border-white/5';
                  if (log.type === 'SUCCESS') {
                    badgeColor = 'text-[#10b981] bg-[#10b981]/10';
                    logBorder = 'border-[#10b981]/20';
                  }
                  if (log.type === 'WARN') {
                    badgeColor = 'text-[#f97316] bg-[#f97316]/10';
                    logBorder = 'border-[#f97316]/20';
                  }
                  if (log.type === 'ERROR') {
                    badgeColor = 'text-[#ef4444] bg-[#ef4444]/10';
                    logBorder = 'border-[#ef4444]/20';
                  }

                  return (
                    <div key={log.id} className={`border border-white/5 bg-[#161e2e]/30 rounded-lg p-2.5 ${logBorder}`}>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[9px] text-[#64748b]">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${badgeColor}`}>
                          {log.type}
                        </span>
                      </div>
                      <div className="text-white leading-relaxed break-words font-medium">
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

      {/* Safety Violation Warning Banner */}
      {isHalted && (
        <div className="bg-[#ef4444] text-white px-6 py-4 flex items-center justify-between font-mono font-bold text-sm tracking-wide shadow-2xl relative z-50 animate-bounce">
          <div className="flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <span>
              CRITICAL INVARIANT VIOLATION DETECTED:{' '}
              {haltError ?? 'Protocol exception'}
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
