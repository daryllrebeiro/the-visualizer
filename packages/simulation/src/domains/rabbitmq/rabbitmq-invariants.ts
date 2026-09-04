import type { RabbitClusterState } from './rabbitmq-types.js';

export interface RabbitInvariantViolation {
  ruleId: string;
  invariantName: string;
  description: string;
  affectedEntities: string[];
}

export class RabbitInvariantChecker {
  public check(state: RabbitClusterState): RabbitInvariantViolation | undefined {
    const consumers = Object.values(state.consumers);
    const queues = Object.values(state.queues);
    const bindings = Object.values(state.bindings);

    // 1. Check Prefetch Limit Safety
    for (const c of consumers) {
      if (c.activeMessages.length > c.prefetchCount) {
        return {
          ruleId: 'AMQP_PREFETCH_OVERFLOW',
          invariantName: 'Prefetch Limit Safety',
          description: `Consumer ${c.name} has ${String(c.activeMessages.length)} active unacknowledged messages exceeding prefetch limit of ${String(c.prefetchCount)}`,
          affectedEntities: [c.id],
        };
      }
    }

    // 2. Check Queue Max Length
    for (const q of queues) {
      if (q.messages.length > q.maxQueueLength) {
        return {
          ruleId: 'AMQP_QUEUE_OVERFLOW',
          invariantName: 'Queue Max-Length Bound',
          description: `Queue ${q.name} message count (${String(q.messages.length)}) exceeds maxQueueLength (${String(q.maxQueueLength)})`,
          affectedEntities: [q.id],
        };
      }
    }

    // 3. Check Binding Consistency
    for (const b of bindings) {
      if (!state.exchanges[b.exchangeName]) {
        return {
          ruleId: 'AMQP_ORPHAN_BINDING',
          invariantName: 'Binding Consistency',
          description: `Binding ${b.id} references non-existent exchange "${b.exchangeName}"`,
          affectedEntities: [b.id],
        };
      }
      if (!state.queues[b.queueName]) {
        return {
          ruleId: 'AMQP_ORPHAN_BINDING',
          invariantName: 'Binding Consistency',
          description: `Binding ${b.id} references non-existent queue "${b.queueName}"`,
          affectedEntities: [b.id],
        };
      }
    }

    return undefined;
  }
}
