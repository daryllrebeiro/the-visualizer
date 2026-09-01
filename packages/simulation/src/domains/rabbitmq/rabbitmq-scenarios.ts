import type { ScenarioDefinition } from '../../engine/types.js';

export const RABBITMQ_SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'rabbit-topic-wildcards',
    title: 'Topic Exchange: Star (*) vs. Hash (#) Routing',
    badge: 'Routing Semantics',
    description:
      'Demonstrates AMQP topic routing. Compares a single-word wildcard pattern (orders.eu.*) with a multi-word wildcard pattern (orders.#) by publishing messages with varied routing keys.',
    steps: [
      '1. Setup: Exchange "amq.topic" bound to "orders.eu" via "orders.eu.*" and "orders.all" via "orders.#".',
      '2. Publish orders.eu.electronics -> Delivered to BOTH queues.',
      '3. Publish orders.us.books -> Matches "orders.#" only -> Delivered to "orders.all".',
      '4. Publish orders.eu.fast.shipping -> 4 tokens: matches "orders.#" only ("orders.eu.*" expects exactly 3 tokens).',
    ],
    actionLabel: '▶ Run Topic Routing Lab',
    tags: ['rabbitmq', 'amqp', 'topic', 'wildcards'],
  },
  {
    id: 'rabbit-dlx-poison-pill',
    title: 'Dead-Letter Exchange (DLX) & Poison Pill Recovery',
    badge: 'Fault Tolerance',
    description:
      'Simulates a corrupted payload that causes a consumer crash. The consumer issues basic.reject(requeue=false), prompting RabbitMQ to route the poison pill message into a Dead-Letter Queue (DLQ).',
    steps: [
      '1. Setup: Queue "orders.eu" configured with deadLetterExchange = "dlx.exchange".',
      '2. Publish Malformed Order: Publish invalid JSON to "orders.eu".',
      '3. Consumer Rejection: Worker-EU-1 rejects message with requeue=false.',
      '4. DLX Rerouting: Message automatically routed to "dlx.dead-letter" with x-death-reason header.',
      '5. Queue Unblocked: Main orders queue resumes normal processing without blocking other orders.',
    ],
    actionLabel: '▶ Run DLX Poison Pill Lab',
    tags: ['rabbitmq', 'dlx', 'dead-letter', 'poison-pill'],
  },
  {
    id: 'rabbit-competing-consumers',
    title: 'Competing Consumers & Prefetch Rate Limiting',
    badge: 'Concurrency & QoS',
    description:
      'Demonstrates fair dispatch across competing workers using basic.qos (prefetchCount). Compares unacknowledged message buffers and worker saturation.',
    steps: [
      '1. Setup: Queue "orders.all" with 2 competing worker instances.',
      '2. Batch Publish: Publish 6 order messages into "orders.all".',
      '3. Prefetch Distribution: Worker-ALL-1 receives up to its prefetch limit (2 active messages).',
      '4. Processing & Acks: As worker acknowledges messages, next queued messages are dispatched immediately.',
    ],
    actionLabel: '▶ Run Competing Consumers Lab',
    tags: ['rabbitmq', 'prefetch', 'competing-consumers', 'qos'],
  },
];
