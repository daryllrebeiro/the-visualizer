/**
 * AMQP 0-9-1 Topic Exchange Pattern Matcher.
 * Matches dot-delimited routing keys against binding patterns containing:
 * - '*' (star) to substitute for exactly one word.
 * - '#' (hash) to substitute for zero or more words.
 */
export function matchTopicPattern(pattern: string, routingKey: string): boolean {
  if (pattern === routingKey) return true;
  if (pattern === '#') return true;

  const patternParts = pattern.split('.');
  const keyParts = routingKey.split('.');

  return matchParts(patternParts, 0, keyParts, 0);
}

function matchParts(
  patternParts: string[],
  pIdx: number,
  keyParts: string[],
  kIdx: number,
): boolean {
  while (pIdx < patternParts.length && kIdx < keyParts.length) {
    const p = patternParts[pIdx]!;

    if (p === '#') {
      // If '#' is the last token in the pattern, it matches everything remaining
      if (pIdx === patternParts.length - 1) return true;

      // Otherwise try matching '#' against 0, 1, 2 ... remaining key parts
      for (let skip = 0; kIdx + skip <= keyParts.length; skip++) {
        if (matchParts(patternParts, pIdx + 1, keyParts, kIdx + skip)) {
          return true;
        }
      }
      return false;
    } else if (p === '*' || p === keyParts[kIdx]) {
      pIdx++;
      kIdx++;
    } else {
      return false;
    }
  }

  // Handle trailing '#' in pattern
  while (pIdx < patternParts.length && patternParts[pIdx] === '#') {
    pIdx++;
  }

  return pIdx === patternParts.length && kIdx === keyParts.length;
}
