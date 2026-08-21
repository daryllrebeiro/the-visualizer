/**
 * Exact Apache Kafka Murmur2 32-bit Key Hasher & Partitioner.
 *
 * Replicates the byte-level behavior of `org.apache.kafka.common.utils.Utils.murmur2(byte[] data)`
 * and `org.apache.kafka.clients.producer.internals.BuiltInPartitioner`.
 */

export function kafkaMurmur2(data: Uint8Array | string): number {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const length = bytes.length;
  const seed = 0x9747b28c;
  const m = 0x5bd1e995;
  const r = 24;

  let h = (seed ^ length) >>> 0;
  const length4 = Math.floor(length / 4);

  for (let i = 0; i < length4; i++) {
    const i4 = i * 4;
    let k =
      ((bytes[i4 + 0] ?? 0) & 0xff) |
      (((bytes[i4 + 1] ?? 0) & 0xff) << 8) |
      (((bytes[i4 + 2] ?? 0) & 0xff) << 16) |
      (((bytes[i4 + 3] ?? 0) & 0xff) << 24);

    k = Math.imul(k, m);
    k = (k ^ (k >>> r)) >>> 0;
    k = Math.imul(k, m);

    h = Math.imul(h, m);
    h = (h ^ k) >>> 0;
  }

  const remaining = length % 4;
  const base = length & ~3;

  if (remaining === 3) {
    h = (h ^ (((bytes[base + 2] ?? 0) & 0xff) << 16)) >>> 0;
  }
  if (remaining >= 2) {
    h = (h ^ (((bytes[base + 1] ?? 0) & 0xff) << 8)) >>> 0;
  }
  if (remaining >= 1) {
    h = (h ^ ((bytes[base] ?? 0) & 0xff)) >>> 0;
    h = Math.imul(h, m) >>> 0;
  }

  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, m) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;

  return h | 0; // Return signed 32-bit integer matching Java int
}

/**
 * Returns a positive integer by stripping the sign bit (matching Java `toPositive(int)`).
 */
export function toPositive(number: number): number {
  return number & 0x7fffffff;
}

/**
 * Maps a message key to a partition index using Kafka's DefaultPartitioner formula:
 * `toPositive(murmur2(keyBytes)) % numPartitions`
 */
export function partitionForKey(key: string | Uint8Array, numPartitions: number): number {
  if (numPartitions <= 0) return 0;
  const hash = kafkaMurmur2(key);
  return toPositive(hash) % numPartitions;
}
