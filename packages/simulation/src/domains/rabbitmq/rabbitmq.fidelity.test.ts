import { describe, expect, it } from 'vitest';
import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import {
  createDefaultRabbitCluster,
  pureRabbitTransition,
} from './rabbitmq-state-transitions.js';
import type { RabbitSimEvent } from './rabbitmq-types.js';

describe('RabbitMQ Domain Fidelity Test Suite (AMQP 0-9-1 & Quorum Queues)', () => {
  describe('Consumer Prefetch basic.qos Invariant', () => {
    it('enforces consumer prefetch limit, preventing queue draining beyond prefetchCount', () => {
      const rng = new DeterministicRNG(42);
      let cluster = createDefaultRabbitCluster();

      // worker-eu-1 has prefetchCount: 1, listening to orders.eu
      expect(cluster.consumers['worker-eu-1']?.prefetchCount).toBe(1);

      // Publish message 1
      const pub1: RabbitSimEvent = {
        id: 'pub-1',
        tick: 1,
        type: 'RABBIT_PUBLISH',
        payload: {
          exchangeName: 'amq.topic',
          routingKey: 'orders.eu.electronics',
          payload: 'order-1',
        },
      };

      cluster = pureRabbitTransition(cluster, pub1, rng).nextState;
      expect(cluster.consumers['worker-eu-1']?.activeMessages.length).toBe(1);

      // Publish message 2 to same queue
      const pub2: RabbitSimEvent = {
        id: 'pub-2',
        tick: 2,
        type: 'RABBIT_PUBLISH',
        payload: {
          exchangeName: 'amq.topic',
          routingKey: 'orders.eu.clothing',
          payload: 'order-2',
        },
      };

      cluster = pureRabbitTransition(cluster, pub2, rng).nextState;
      // Consumer must still have exactly 1 active message due to prefetch limit!
      expect(cluster.consumers['worker-eu-1']?.activeMessages.length).toBe(1);
      // The second message must remain queued in orders.eu
      const queue = cluster.queues['orders.eu']!;
      const queuedMsg = queue.messages.find((m) => m.payload === 'order-2');
      expect(queuedMsg?.state).toBe('InQueue');
    });
  });

  describe('Publisher Confirms (RabbitMQ Extension)', () => {
    it('dispatches basic.ack confirmation with sequential deliveryTag upon durable queue placement', () => {
      const rng = new DeterministicRNG(42);
      let cluster = createDefaultRabbitCluster();

      // Enable publisher confirms
      const cfg: RabbitSimEvent = {
        id: 'cfg-confirms',
        tick: 1,
        type: 'RABBIT_CONFIGURE_FIDELITY',
        payload: { publisherConfirmsEnabled: true, fidelityMode: 'REALISTIC' },
      };
      cluster = pureRabbitTransition(cluster, cfg, rng).nextState;

      const pub: RabbitSimEvent = {
        id: 'pub-ack-test',
        tick: 2,
        type: 'RABBIT_PUBLISH',
        payload: {
          exchangeName: 'amq.topic',
          routingKey: 'orders.eu.books',
          payload: 'book-order',
        },
      };

      const res = pureRabbitTransition(cluster, pub, rng);
      expect(res.nextState.totalConfirmed).toBe(1);

      const confirmEvent = res.emittedEvents.find((e) => e.type === 'RABBIT_BASIC_ACK');
      expect(confirmEvent).toBeDefined();
      expect(confirmEvent?.payload['deliveryTag']).toBe(1);
    });
  });

  describe('Alternate Exchange (AE) Unroutable Message Forwarding', () => {
    it('routes unroutable messages from primary exchange to designated alternate exchange', () => {
      const rng = new DeterministicRNG(42);
      let cluster = createDefaultRabbitCluster();

      // Configure direct exchange to have amq.fanout as its alternateExchange
      cluster.exchanges['amq.direct']!.alternateExchange = 'amq.fanout';

      // Publish message with unknown routing key that has no binding on amq.direct
      const pub: RabbitSimEvent = {
        id: 'pub-unroutable',
        tick: 1,
        type: 'RABBIT_PUBLISH',
        payload: {
          exchangeName: 'amq.direct',
          routingKey: 'unknown.route.xyz',
          payload: 'fallback-payload',
        },
      };

      const res = pureRabbitTransition(cluster, pub, rng);
      expect(res.nextState.totalUnroutableToAlternate).toBe(1);

      // amq.fanout is bound to 'notifications' queue
      const notifQueue = res.nextState.queues['notifications']!;
      const routedMsg = notifQueue.messages.find((m) => m.payload === 'fallback-payload');
      expect(routedMsg).toBeDefined();
    });
  });
});
