import { describe, expect, it } from 'vitest';
import { kafkaMurmur2, partitionForKey, toPositive } from './murmur2.js';

describe('Kafka Murmur2 Partitioner Tests', () => {
  it('should compute consistent hash for string keys', () => {
    const hash1 = kafkaMurmur2('user-1001');
    const hash2 = kafkaMurmur2('user-1001');
    expect(hash1).toBe(hash2);
    expect(typeof hash1).toBe('number');
  });

  it('should strip negative bit via toPositive', () => {
    expect(toPositive(-42)).toBeGreaterThanOrEqual(0);
    expect(toPositive(12345)).toBe(12345);
    expect(toPositive(-1)).toBe(0x7fffffff);
  });

  it('should map identical keys to identical partitions', () => {
    const key = 'order-xyz-987';
    const p1 = partitionForKey(key, 3);
    const p2 = partitionForKey(key, 3);
    const p3 = partitionForKey(key, 3);

    expect(p1).toBe(p2);
    expect(p2).toBe(p3);
    expect(p1).toBeGreaterThanOrEqual(0);
    expect(p1).toBeLessThan(3);
  });

  it('should handle edge cases (empty key, single partition)', () => {
    expect(partitionForKey('', 3)).toBeGreaterThanOrEqual(0);
    expect(partitionForKey('key', 1)).toBe(0);
    expect(partitionForKey('key', 0)).toBe(0);
  });
});
