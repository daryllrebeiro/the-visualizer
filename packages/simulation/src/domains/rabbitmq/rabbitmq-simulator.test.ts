import { describe, expect, it } from 'vitest';

import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import { RabbitInvariantChecker } from './rabbitmq-invariants.js';
import { createDefaultRabbitCluster, pureRabbitTransition } from './rabbitmq-state-transitions.js';
import type { RabbitSimEvent } from './rabbitmq-types.js';
import { matchTopicPattern } from './topic-matcher.js';

describe('RabbitMQ AMQP 0-9-1 Exchanges & Queues Simulation', () => {
  it('should match topic wildcard patterns accurately (* and #)', () => {
    expect(matchTopicPattern('orders.eu.*', 'orders.eu.electronics')).toBe(true);
    expect(matchTopicPattern('orders.eu.*', 'orders.eu.books')).toBe(true);
    expect(matchTopicPattern('orders.eu.*', 'orders.us.books')).toBe(false);
    expect(matchTopicPattern('orders.eu.*', 'orders.eu.fast.shipping')).toBe(false); // Expects exactly 3 tokens

    expect(matchTopicPattern('orders.#', 'orders.eu.electronics')).toBe(true);
    expect(matchTopicPattern('orders.#', 'orders.us.books')).toBe(true);
    expect(matchTopicPattern('orders.#', 'orders.eu.fast.shipping')).toBe(true);
    expect(matchTopicPattern('orders.#', 'orders')).toBe(true);
    expect(matchTopicPattern('orders.#', 'payments.eu')).toBe(false);
  });

  it('should initialize 4 exchanges, 4 queues, and 3 consumers with valid invariants', () => {
    const cluster = createDefaultRabbitCluster();
    const checker = new RabbitInvariantChecker();

    expect(Object.keys(cluster.exchanges).length).toBe(4);
    expect(Object.keys(cluster.queues).length).toBe(4);
    expect(checker.check(cluster)).toBeUndefined();
  });

  it('should publish message to topic exchange and deliver to multiple matching queues and dispatch to consumer up to prefetch limit', () => {
    const rng = new DeterministicRNG(42);
    const cluster = createDefaultRabbitCluster();

    const pubEv: RabbitSimEvent = {
      id: 'pub-1',
      tick: 1,
      type: 'RABBIT_PUBLISH',
      payload: {
        exchangeName: 'amq.topic',
        routingKey: 'orders.eu.electronics',
        payload: '{"orderId":"101","amount":99.50}',
      },
    };

    const res = pureRabbitTransition(cluster, pubEv, rng);

    // Should be enqueued into both orders.eu and orders.all
    expect(res.nextState.queues['orders.eu']?.messages.length).toBe(1);
    expect(res.nextState.queues['orders.all']?.messages.length).toBe(1);

    // Worker-EU-1 has prefetchCount: 1, should have 1 active message
    expect(res.nextState.consumers['worker-eu-1']?.activeMessages.length).toBe(1);
  });

  it('should acknowledge message and remove from active buffer and queue', () => {
    const rng = new DeterministicRNG(42);
    let state = createDefaultRabbitCluster();

    // Publish message
    const pubEv: RabbitSimEvent = {
      id: 'pub-ack',
      tick: 5,
      type: 'RABBIT_PUBLISH',
      payload: {
        exchangeName: 'amq.topic',
        routingKey: 'orders.eu.books',
        payload: '{"orderId":"202"}',
      },
    };
    state = pureRabbitTransition(state, pubEv, rng).nextState;

    const activeMsg = state.consumers['worker-eu-1']!.activeMessages[0]!;
    expect(activeMsg).toBeDefined();

    // Acknowledge message
    const ackEv: RabbitSimEvent = {
      id: 'ack-1',
      tick: 6,
      type: 'RABBIT_ACK',
      payload: {
        messageId: activeMsg.id,
        consumerId: 'worker-eu-1',
      },
    };

    const ackRes = pureRabbitTransition(state, ackEv, rng);
    expect(ackRes.nextState.totalAcked).toBe(1);
    expect(ackRes.nextState.consumers['worker-eu-1']?.activeMessages.length).toBe(0);
    expect(ackRes.nextState.queues['orders.eu']?.messages.length).toBe(0);
  });

  it('should route rejected poison pill message into Dead-Letter Queue (DLQ)', () => {
    const rng = new DeterministicRNG(42);
    let state = createDefaultRabbitCluster();

    // Publish to orders.eu (which is bound to dlx.exchange)
    const pubEv: RabbitSimEvent = {
      id: 'pub-poison',
      tick: 10,
      type: 'RABBIT_PUBLISH',
      payload: {
        exchangeName: 'amq.topic',
        routingKey: 'orders.eu.invalid',
        payload: 'MALFORMED_PAYLOAD',
      },
    };
    state = pureRabbitTransition(state, pubEv, rng).nextState;

    const activeMsg = state.consumers['worker-eu-1']!.activeMessages[0]!;
    expect(activeMsg).toBeDefined();

    // Reject without requeue
    const rejectEv: RabbitSimEvent = {
      id: 'rej-1',
      tick: 12,
      type: 'RABBIT_REJECT',
      payload: {
        messageId: activeMsg.id,
        consumerId: 'worker-eu-1',
        requeue: false,
      },
    };

    const rejRes = pureRabbitTransition(state, rejectEv, rng);
    expect(rejRes.nextState.totalNacked).toBe(1);
    expect(rejRes.nextState.totalDeadLettered).toBe(1);

    // DLQ should now contain the message
    const dlq = rejRes.nextState.queues['dlx.dead-letter']!;
    expect(dlq.messages.length).toBe(1);
    expect(dlq.messages[0]?.state).toBe('DeadLettered');
  });
});
