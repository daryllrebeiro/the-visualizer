export interface StateDiff {
  path: string;
  kind: 'added' | 'removed' | 'changed';
  before?: unknown;
  after?: unknown;
}

const MAX_DIFF_PATHS = 200;
const MAX_DIFF_DEPTH = 12;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Generic structural diff between two serializable domain states. Works for
 * every domain uniformly — no per-domain logic. Cycle-safe, depth- and
 * count-capped so adversarial states cannot blow up the UI.
 */
export function structuralDiff(before: unknown, after: unknown): StateDiff[] {
  const diffs: StateDiff[] = [];
  const seen = new WeakSet<object>();
  walk(before, after, '$', 0, diffs, seen);
  return diffs;
}

function walk(
  before: unknown,
  after: unknown,
  path: string,
  depth: number,
  diffs: StateDiff[],
  seen: WeakSet<object>,
): void {
  if (diffs.length >= MAX_DIFF_PATHS || depth > MAX_DIFF_DEPTH) return;
  if (Object.is(before, after)) return;

  if (Array.isArray(before) && Array.isArray(after)) {
    const len = Math.max(before.length, after.length);
    for (let i = 0; i < len; i++) {
      if (diffs.length >= MAX_DIFF_PATHS) return;
      if (i >= before.length) {
        diffs.push({ path: `${path}[${String(i)}]`, kind: 'added', after: after[i] });
      } else if (i >= after.length) {
        diffs.push({ path: `${path}[${String(i)}]`, kind: 'removed', before: before[i] });
      } else {
        walk(before[i], after[i], `${path}[${String(i)}]`, depth + 1, diffs, seen);
      }
    }
    return;
  }

  if (isPlainObject(before) && isPlainObject(after)) {
    if (seen.has(before) || seen.has(after)) return;
    seen.add(before);
    seen.add(after);
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      if (diffs.length >= MAX_DIFF_PATHS) return;
      if (!(key in before)) {
        diffs.push({ path: `${path}.${key}`, kind: 'added', after: after[key] });
      } else if (!(key in after)) {
        diffs.push({ path: `${path}.${key}`, kind: 'removed', before: before[key] });
      } else {
        walk(before[key], after[key], `${path}.${key}`, depth + 1, diffs, seen);
      }
    }
    return;
  }

  diffs.push({ path, kind: 'changed', before, after });
}

/** Ticks at which two per-tick state series first diverge, capped for the UI. */
export function divergenceTicks(seriesA: unknown[], seriesB: unknown[], cap = 100): number[] {
  const out: number[] = [];
  const len = Math.min(seriesA.length, seriesB.length);
  for (let tick = 0; tick < len; tick++) {
    if (structuralDiff(seriesA[tick], seriesB[tick]).length > 0) {
      out.push(tick);
      if (out.length >= cap) break;
    }
  }
  return out;
}
