/**
 * Slow-tick shedding.
 *
 * The gateway records how long each room's tick takes. When a room sustains
 * overruns it is a noisy neighbor that threatens every other room's heartbeat,
 * so the scheduler degrades it deliberately rather than letting the whole
 * process drift:
 *
 *   ok    → run at the configured tick rate
 *   shed  → reduce effective tick rate (skip ticks) to protect the loop
 *   halt  → escalate to a session halt when shedding does not recover
 *
 * Pure and deterministic so it can be unit-tested without Redis or timers.
 */
export type ShedDecision = 'ok' | 'shed' | 'halt';

export interface TickBudgetOptions {
  /** Rolling window size (number of samples). */
  window?: number;
  /** Average duration at which we start shedding. */
  shedThresholdMs?: number;
  /** Average duration at which we halt. */
  haltThresholdMs?: number;
  /** Consecutive shed decisions before escalating to halt. */
  shedStreakForHalt?: number;
}

export class TickBudget {
  private readonly samples: number[] = [];
  private readonly window: number;
  private readonly shedThresholdMs: number;
  private readonly haltThresholdMs: number;
  private readonly shedStreakForHalt: number;
  private shedStreak = 0;

  constructor(options: TickBudgetOptions = {}) {
    this.window = Math.max(1, options.window ?? 20);
    this.shedThresholdMs = options.shedThresholdMs ?? 40;
    this.haltThresholdMs = options.haltThresholdMs ?? 250;
    this.shedStreakForHalt = Math.max(1, options.shedStreakForHalt ?? 15);
  }

  public record(durationMs: number): void {
    this.samples.push(durationMs);
    if (this.samples.length > this.window) this.samples.shift();
  }

  public averageMs(): number {
    if (this.samples.length === 0) return 0;
    return this.samples.reduce((sum, v) => sum + v, 0) / this.samples.length;
  }

  public decide(): ShedDecision {
    const avg = this.averageMs();
    if (avg >= this.haltThresholdMs) {
      this.shedStreak += 1;
      return 'halt';
    }
    if (avg >= this.shedThresholdMs) {
      this.shedStreak += 1;
      return this.shedStreak >= this.shedStreakForHalt ? 'halt' : 'shed';
    }
    this.shedStreak = 0;
    return 'ok';
  }

  /** Tick-rate multiplier to apply when shedding (run every Nth tick). */
  public static shedEveryNthTick(avgMs: number, shedThresholdMs: number): number {
    if (avgMs < shedThresholdMs) return 1;
    return Math.min(10, Math.max(2, Math.ceil(avgMs / shedThresholdMs)));
  }

  public reset(): void {
    this.samples.length = 0;
    this.shedStreak = 0;
  }
}
