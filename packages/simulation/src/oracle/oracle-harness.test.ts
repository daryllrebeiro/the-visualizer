import { describe, expect, it } from 'vitest';
import { KafkaOracleHarness } from './oracle-harness.js';

describe('KafkaOracleHarness differential verification', () => {
  const harness = new KafkaOracleHarness();

  it('should pass Replication & High-Watermark barrier scenario', async () => {
    const result = await harness.executeScenario('replication');
    expect(result.passed).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.assertionsEvaluated).toBeGreaterThan(0);
  });

  it('should pass Leader Failover & Epoch Fencing scenario', async () => {
    const result = await harness.executeScenario('failover');
    expect(result.passed).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.assertionsEvaluated).toBeGreaterThan(0);
  });

  it('should pass Consumer Group Exclusive Assignment & Range Rebalance scenario', async () => {
    const result = await harness.executeScenario('rebalance');
    expect(result.passed).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.assertionsEvaluated).toBeGreaterThan(0);
  });
});
