import { type Operation, applyPatch } from 'fast-json-patch';
import { pack, unpack } from 'msgpackr';

import type { KafkaClusterState } from '@the-visualizer/contracts';

export type ConnectionStatus = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED';

export interface EntityRef {
  type: 'producer' | 'broker' | 'consumer' | 'partition' | 'topic' | 'controller' | 'consumerGroup';
  id: string;
}

export interface EventLogItem {
  id: string;
  timestamp: number;
  tick?: number | undefined;
  message: string;
  type: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR';
  eventType?: string | undefined;
  involvedEntities?: EntityRef[] | undefined;
  payload?: Record<string, unknown> | undefined;
}

export interface WsClientCallbacks {
  onStateChange: (state: KafkaClusterState) => void;
  onStatusChange: (status: ConnectionStatus) => void;
  onHalt: (error: string, tick: number) => void;
  onEventLog: (log: EventLogItem) => void;
}

export class WebSocketClient {
  private socket: WebSocket | null = null;
  private url: string;
  private token: string;
  private roomId: string;
  private domainId: string;
  private callbacks: WsClientCallbacks;

  private status: ConnectionStatus = 'DISCONNECTED';
  private state: KafkaClusterState | null = null;
  private expectedSequence: number | null = null;
  private pendingUpdates = new Map<number, { sequence: number; type: string; payload: any }>();
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 16000;
  private isClosedIntentional = false;

  constructor(
    url: string,
    token: string,
    roomId: string,
    domainId: string,
    callbacks: WsClientCallbacks,
  ) {
    this.url = url;
    this.token = token;
    this.roomId = roomId;
    this.domainId = domainId;
    this.callbacks = callbacks;
  }

  public connect(): void {
    this.isClosedIntentional = false;
    this.updateStatus('CONNECTING');

    const wsUrl = `${this.url}?token=${this.token}`;
    try {
      this.socket = new WebSocket(wsUrl);
      this.socket.binaryType = 'arraybuffer';

      this.socket.onopen = () => {
        this.updateStatus('CONNECTED');
        this.reconnectDelay = 1000;
        this.addLog('Connected to WebSocket gateway', 'SUCCESS');

        // Join the requested room
        this.sendIntent('JOIN_ROOM', { roomId: this.roomId, domainId: this.domainId });
      };

      this.socket.onmessage = (event: MessageEvent) => {
        this.handleMessage(event);
      };

      this.socket.onclose = () => {
        this.updateStatus('DISCONNECTED');
        if (!this.isClosedIntentional) {
          this.addLog('Connection lost. Reconnecting...', 'WARN');
          this.scheduleReconnect();
        }
      };

      this.socket.onerror = () => {
        this.addLog('WebSocket error encountered', 'ERROR');
      };
    } catch {
      this.updateStatus('DISCONNECTED');
      this.scheduleReconnect();
    }
  }

  public disconnect(): void {
    this.isClosedIntentional = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.updateStatus('DISCONNECTED');
    this.addLog('Session disconnected', 'INFO');
  }

  public sendIntent(type: string, payload: any): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      const data = pack({ type, payload });
      this.socket.send(data);
    } else {
      this.addLog('Cannot send intent. Socket is not connected', 'ERROR');
    }
  }

  private handleMessage(event: MessageEvent): void {
    try {
      let data: ArrayBuffer;
      if (event.data instanceof ArrayBuffer) {
        data = event.data;
      } else if (event.data instanceof Blob) {
        // Blob fallback (though we set binaryType to arraybuffer)
        void event.data.arrayBuffer().then((buf) => {
          this.processDecodedMessage(unpack(new Uint8Array(buf)));
        });
        return;
      } else {
        return;
      }

      const decoded = unpack(new Uint8Array(data));
      this.processDecodedMessage(decoded);
    } catch {
      this.addLog('Failed to decode message package', 'ERROR');
    }
  }

  private processDecodedMessage(msg: any): void {
    if (typeof msg !== 'object' || msg === null) return;

    // A. Handle non-sequenced messages
    if (msg.type === 'INIT_SNAPSHOT') {
      const { state, tick } = msg.payload;
      this.state = JSON.parse(JSON.stringify(state)) as KafkaClusterState;
      this.state.tick = tick !== undefined ? tick : (state?.tick ?? 0);
      this.expectedSequence = null;
      this.pendingUpdates.clear();
      this.callbacks.onStateChange(this.state);
      this.addLog(`Received initial cluster state snapshot at tick ${String(tick)}`, 'INFO');
      return;
    }

    if (msg.type === 'ROOM_JOINED') {
      this.addLog(`Successfully joined room "${String(msg.payload.roomId)}"`, 'SUCCESS');
      return;
    }

    if (msg.type === 'MSG_INTENT_ACK') {
      const { status, reason } = msg.payload;
      if (status === 'REJECTED') {
        this.addLog(`Intent rejected: ${String(reason)}`, 'ERROR');
      } else {
        this.addLog(`Intent accepted`, 'SUCCESS');
      }
      return;
    }

    if (msg.type === 'SESSION_ERROR') {
      const { code, message } = msg.payload;
      this.addLog(`Session error (${String(code)}): ${String(message)}`, 'ERROR');
      return;
    }

    if (msg.type === 'INIT_SNAPSHOT_REQUIRED') {
      this.addLog('Gateway requested full snapshot synchronization', 'WARN');
      this.sendIntent('JOIN_ROOM', { roomId: this.roomId });
      return;
    }

    // B. Handle sequenced messages
    if (typeof msg.sequence === 'number') {
      const seq = msg.sequence;
      if (this.expectedSequence === null) {
        this.expectedSequence = seq;
      }

      let expected = this.expectedSequence as number;
      if (seq === expected) {
        this.applyUpdate(msg);
        expected++;

        // Process any buffered out-of-order updates that fill the next slot
        while (this.pendingUpdates.has(expected)) {
          const nextMsg = this.pendingUpdates.get(expected);
          this.pendingUpdates.delete(expected);
          if (nextMsg) {
            this.applyUpdate(nextMsg);
          }
          expected++;
        }
        this.expectedSequence = expected;
      } else if (seq > expected) {
        // Buffer out-of-order update
        this.pendingUpdates.set(seq, msg);
        this.addLog(
          `Sequence gap detected. Expected: ${String(expected)}, Got: ${String(seq)}. Dispatching GAP_RECOVERY.`,
          'WARN',
        );
        this.sendIntent('GAP_RECOVERY', { fromSequence: expected });
      }
      // If seq < expected, ignore it as duplicate/already processed
    }
  }

  private applyUpdate(msg: { type: string; payload: any }): void {
    if (!this.state) return;

    if (msg.type === 'EVENT_BATCH') {
      const { tick, patch } = msg.payload;
      try {
        const result = applyPatch(this.state, patch as Operation[]);
        this.state = result.newDocument as KafkaClusterState;
        this.state.tick = tick;
        this.callbacks.onStateChange(JSON.parse(JSON.stringify(this.state)) as KafkaClusterState);

        // Surface cluster-level record commits and high watermark advances to event log
        for (const op of patch as Operation[]) {
          if (op.path.includes('highWatermark') && 'value' in op && typeof op.value === 'number') {
            const match = /\/topics\/([^/]+)\/(\d+)\/highWatermark/.exec(op.path);
            if (match) {
              const topic = match[1] ?? 'topic';
              const partition = match[2] ?? '0';
              this.addLog(
                `[Cluster] Committed record on ${topic}/p-${partition} (HW: ${String(op.value)})`,
                'INFO',
              );
            }
          }
        }
      } catch {
        this.addLog(
          `Failed to apply delta patch at tick ${String(tick)}. Requesting resync.`,
          'ERROR',
        );
        this.sendIntent('JOIN_ROOM', { roomId: this.roomId });
      }
    } else if (msg.type === 'INVARIANT_VIOLATION') {
      const { error, tick } = msg.payload;
      this.callbacks.onHalt(error, tick);
      this.addLog(`SAFETY HALT: ${String(error)} (tick ${String(tick)})`, 'ERROR');
    } else if (msg.type === 'INTENT_ACK') {
      const { status, reason } = msg.payload;
      if (status === 'REJECTED') {
        this.addLog(`Execution failed: ${String(reason)}`, 'WARN');
      } else {
        this.addLog(`Execution completed successfully`, 'SUCCESS');
      }
    }
  }

  private updateStatus(newStatus: ConnectionStatus): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.callbacks.onStatusChange(newStatus);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) return;

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      this.connect();
    }, this.reconnectDelay);
  }

  private addLog(message: string, type: EventLogItem['type']): void {
    const log: EventLogItem = {
      id: Math.random().toString(36).substring(7),
      timestamp: Date.now(),
      message,
      type,
    };
    this.callbacks.onEventLog(log);
  }
}
