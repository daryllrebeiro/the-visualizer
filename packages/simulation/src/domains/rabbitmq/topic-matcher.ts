/**
 * AMQP 0-9-1 Topic Exchange Pattern Matcher.
 * Matches dot-delimited routing keys against binding patterns containing:
 * - '*' (star) to substitute for exactly one word.
 * - '#' (hash) to substitute for zero or more words.
 *
 * Implements canonical AMQP token collapse and dynamic programming memoization
 * to eliminate catastrophic backtracking (ReDoS/CPU exhaustion attacks, CWE-1333).
 */
export function matchTopicPattern(pattern: string, routingKey: string): boolean {
  if (pattern === routingKey) return true;
  if (pattern === '#') return true;

  const rawPatternParts = pattern.split('.');
  const keyParts = routingKey.split('.');

  // 1. AMQP canonical rule: consecutive '#' wildcards are redundant (#.# === #)
  const patternParts: string[] = [];
  for (const part of rawPatternParts) {
    if (part === '#' && patternParts[patternParts.length - 1] === '#') {
      continue;
    }
    patternParts.push(part);
  }

  // Bound token depth to prevent stack exhaustion on adversarial inputs
  if (patternParts.length > 64 || keyParts.length > 64) {
    return false;
  }

  // 2. Memoized matching state table (pIdx, kIdx) -> boolean
  const memo = new Map<number, boolean>();

  return matchParts(patternParts, 0, keyParts, 0, memo);
}

function matchParts(
  patternParts: string[],
  pIdx: number,
  keyParts: string[],
  kIdx: number,
  memo: Map<number, boolean>,
): boolean {
  const stateKey = (pIdx << 16) | kIdx;
  const cached = memo.get(stateKey);
  if (cached !== undefined) return cached;

  while (pIdx < patternParts.length && kIdx < keyParts.length) {
    const p = patternParts[pIdx]!;

    if (p === '#') {
      // If '#' is the last token in the pattern, it matches everything remaining
      if (pIdx === patternParts.length - 1) {
        memo.set(stateKey, true);
        return true;
      }

      // Otherwise try matching '#' against 0, 1, 2 ... remaining key parts
      for (let skip = 0; kIdx + skip <= keyParts.length; skip++) {
        if (matchParts(patternParts, pIdx + 1, keyParts, kIdx + skip, memo)) {
          memo.set(stateKey, true);
          return true;
        }
      }
      memo.set(stateKey, false);
      return false;
    } else if (p === '*' || p === keyParts[kIdx]) {
      pIdx++;
      kIdx++;
    } else {
      memo.set(stateKey, false);
      return false;
    }
  }

  // Handle trailing '#' in pattern
  while (pIdx < patternParts.length && patternParts[pIdx] === '#') {
    pIdx++;
  }

  const result = pIdx === patternParts.length && kIdx === keyParts.length;
  memo.set(stateKey, result);
  return result;
}

