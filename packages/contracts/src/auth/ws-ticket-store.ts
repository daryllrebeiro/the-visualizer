import * as crypto from 'crypto';

export interface WsTicketData {
  userId: string;
  email: string;
  name: string;
  domainId?: string;
  createdAt: number;
}

export interface WsTicketBackend {
  set(key: string, value: string, mode: string, duration: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<unknown>;
}

export class WsTicketStore {
  private tickets = new Map<string, { data: WsTicketData; expiresAt: number }>();
  private backend: WsTicketBackend | null = null;

  setBackend(backend: WsTicketBackend | null): void {
    this.backend = backend;
  }

  async createTicket(data: WsTicketData, ttlSeconds: number = 30): Promise<string> {
    const ticketId = `wst_${crypto.randomBytes(16).toString('hex')}`;
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.tickets.set(ticketId, { data, expiresAt });
    if (this.backend) {
      try {
        await this.backend.set(`ws_ticket:${ticketId}`, JSON.stringify(data), 'EX', ttlSeconds);
      } catch {
        // Fallback to memory
      }
    }
    this.cleanup();
    return ticketId;
  }

  async consumeTicket(ticketId: string): Promise<WsTicketData | null> {
    // Single-use: once consumed, immediately deleted
    if (this.backend) {
      try {
        const raw = await this.backend.get(`ws_ticket:${ticketId}`);
        if (raw) {
          await this.backend.del(`ws_ticket:${ticketId}`);
          return JSON.parse(raw) as WsTicketData;
        }
      } catch {
        // Fallback to memory
      }
    }

    const entry = this.tickets.get(ticketId);
    if (!entry) return null;
    this.tickets.delete(ticketId);
    if (Date.now() > entry.expiresAt) return null;
    return entry.data;
  }

  cleanup(): void {
    const now = Date.now();
    for (const [id, entry] of this.tickets.entries()) {
      if (now > entry.expiresAt) {
        this.tickets.delete(id);
      }
    }
  }

  clear(): void {
    this.tickets.clear();
  }
}

export const wsTicketStore = new WsTicketStore();
