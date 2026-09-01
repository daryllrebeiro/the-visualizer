import { DeterministicRNG } from '../../prng/deterministic-rng.js';
import { matchTopicPattern } from './topic-matcher.js';
import type {
  AMQPMessage,
  BindingSpec,
  ExchangeSpec,
  RabbitClusterState,
  RabbitConsumer,
  RabbitPublishPayload,
  RabbitQueue,
  RabbitSimEvent,
} from './rabbitmq-types.js';

export interface RabbitTransitionResult {
  nextState: RabbitClusterState;
  emittedEvents: RabbitSimEvent[];
}

export function createDefaultRabbitCluster(clusterId = 'rabbit-cluster-1'): RabbitClusterState {
  const exchanges: Record<string, ExchangeSpec> = {
    'amq.topic': {
      id: 'ex-topic',
      name: 'amq.topic',
      type: 'topic',
      durable: true,
      autoDelete: false,
      color: '#38bdf8',
    },
    'amq.fanout': {
      id: 'ex-fanout',
      name: 'amq.fanout',
      type: 'fanout',
      durable: true,
      autoDelete: false,
      color: '#34d399',
    },
    'amq.direct': {
      id: 'ex-direct',
      name: 'amq.direct',
      type: 'direct',
      durable: true,
      autoDelete: false,
      color: '#fbbf24',
    },
    'dlx.exchange': {
      id: 'ex-dlx',
      name: 'dlx.exchange',
      type: 'fanout',
      durable: true,
      autoDelete: false,
      color: '#f43f5e',
    },
  };

  const queues: Record<string, RabbitQueue> = {
    'orders.eu': {
      id: 'q-orders-eu',
      name: 'orders.eu',
      durable: true,
      deadLetterExchange: 'dlx.exchange',
      deadLetterRoutingKey: null,
      maxQueueLength: 50,
      messageTtl: null,
      messages: [],
      consumerCount: 1,
      color: '#38bdf8',
    },
    'orders.all': {
      id: 'q-orders-all',
      name: 'orders.all',
      durable: true,
      deadLetterExchange: null,
      deadLetterRoutingKey: null,
      maxQueueLength: 50,
      messageTtl: null,
      messages: [],
      consumerCount: 1,
      color: '#818cf8',
    },
    'notifications': {
      id: 'q-notif',
      name: 'notifications',
      durable: true,
      deadLetterExchange: null,
      deadLetterRoutingKey: null,
      maxQueueLength: 50,
      messageTtl: null,
      messages: [],
      consumerCount: 1,
      color: '#34d399',
    },
    'dlx.dead-letter': {
      id: 'q-dlx',
      name: 'dlx.dead-letter',
      durable: true,
      deadLetterExchange: null,
      deadLetterRoutingKey: null,
      maxQueueLength: 50,
      messageTtl: null,
      messages: [],
      consumerCount: 0,
      color: '#f43f5e',
    },
  };

  const bindings: Record<string, BindingSpec> = {
    'b-topic-eu': {
      id: 'b-topic-eu',
      exchangeName: 'amq.topic',
      queueName: 'orders.eu',
      routingKeyPattern: 'orders.eu.*',
    },
    'b-topic-all': {
      id: 'b-topic-all',
      exchangeName: 'amq.topic',
      queueName: 'orders.all',
      routingKeyPattern: 'orders.#',
    },
    'b-fanout-notif': {
      id: 'b-fanout-notif',
      exchangeName: 'amq.fanout',
      queueName: 'notifications',
      routingKeyPattern: '',
    },
    'b-dlx-queue': {
      id: 'b-dlx-queue',
      exchangeName: 'dlx.exchange',
      queueName: 'dlx.dead-letter',
      routingKeyPattern: '',
    },
  };

  const consumers: Record<string, RabbitConsumer> = {
    'worker-eu-1': {
      id: 'worker-eu-1',
      name: 'Worker-EU-1',
      queueName: 'orders.eu',
      prefetchCount: 1,
      activeMessages: [],
      status: 'Active',
    },
    'worker-all-1': {
      id: 'worker-all-1',
      name: 'Worker-ALL-1',
      queueName: 'orders.all',
      prefetchCount: 2,
      activeMessages: [],
      status: 'Active',
    },
    'worker-notif-1': {
      id: 'worker-notif-1',
      name: 'Worker-Notif-1',
      queueName: 'notifications',
      prefetchCount: 1,
      activeMessages: [],
      status: 'Active',
    },
  };

  return {
    clusterId,
    tick: 0,
    rngState: 42,
    exchanges,
    queues,
    bindings,
    consumers,
    totalPublished: 0,
    totalAcked: 0,
    totalNacked: 0,
    totalDeadLettered: 0,
  };
}

export function pureRabbitTransition(
  state: RabbitClusterState,
  event: RabbitSimEvent,
  rng: DeterministicRNG,
): RabbitTransitionResult {
  const nextState: RabbitClusterState = JSON.parse(JSON.stringify(state)) as RabbitClusterState;
  const emittedEvents: RabbitSimEvent[] = [];

  nextState.tick = event.tick;

  switch (event.type) {
    case 'RABBIT_PUBLISH':
      handlePublish(nextState, event, emittedEvents);
      break;
    case 'RABBIT_ACK':
      handleAck(nextState, event);
      break;
    case 'RABBIT_NACK':
    case 'RABBIT_REJECT':
      handleNackOrReject(nextState, event, emittedEvents);
      break;
    case 'RABBIT_TICK':
      handleTick(nextState, emittedEvents);
      break;
  }

  // Dispatch queued messages to waiting consumers
  dispatchMessagesToConsumers(nextState);

  nextState.rngState = rng.getState();
  return { nextState, emittedEvents };
}

function handlePublish(
  state: RabbitClusterState,
  event: RabbitSimEvent,
  emittedEvents: RabbitSimEvent[],
): void {
  const p = event.payload as unknown as RabbitPublishPayload;
  const exchange = state.exchanges[p.exchangeName];
  if (!exchange) return;

  const msgId = `msg-${String(state.tick)}-${Math.random().toString(36).substring(2, 6)}`;
  const message: AMQPMessage = {
    id: msgId,
    payload: p.payload,
    routingKey: p.routingKey,
    headers: p.headers ?? {},
    ttl: p.ttl ?? null,
    retries: 0,
    createdAtTick: state.tick,
    state: 'InExchange',
    assignedConsumerId: null,
  };

  state.totalPublished++;

  // Find matching queues
  const matchingQueueNames = findMatchingQueues(state, exchange, p.routingKey);

  for (const qName of matchingQueueNames) {
    const q = state.queues[qName];
    if (q) {
      const qMsg: AMQPMessage = {
        ...message,
        id: `${msgId}-${q.name}`,
        state: 'InQueue',
      };
      if (q.messages.length < q.maxQueueLength) {
        q.messages.push(qMsg);
        emittedEvents.push({
          id: `deliv-${qMsg.id}`,
          tick: state.tick,
          type: 'RABBIT_MESSAGE_DELIVERED',
          payload: { messageId: qMsg.id, queueName: q.name, routingKey: p.routingKey },
        });
      } else if (q.deadLetterExchange) {
        // Overflow to DLX
        routeToDLX(state, q, qMsg, 'QueueLengthOverflow', emittedEvents);
      }
    }
  }
}

function findMatchingQueues(
  state: RabbitClusterState,
  exchange: ExchangeSpec,
  routingKey: string,
): string[] {
  const matchedQueues: string[] = [];
  const bindings = Object.values(state.bindings) as BindingSpec[];

  for (const b of bindings) {
    if (b.exchangeName !== exchange.name) continue;

    if (exchange.type === 'fanout') {
      matchedQueues.push(b.queueName);
    } else if (exchange.type === 'direct') {
      if (b.routingKeyPattern === routingKey) {
        matchedQueues.push(b.queueName);
      }
    } else if (exchange.type === 'topic') {
      if (matchTopicPattern(b.routingKeyPattern, routingKey)) {
        matchedQueues.push(b.queueName);
      }
    }
  }

  return Array.from(new Set(matchedQueues));
}

function handleAck(state: RabbitClusterState, event: RabbitSimEvent): void {
  const messageId = String(event.payload['messageId'] ?? '');
  const consumerId = String(event.payload['consumerId'] ?? '');

  const consumer = state.consumers[consumerId];
  if (consumer) {
    consumer.activeMessages = consumer.activeMessages.filter((m) => m.id !== messageId);
  }

  // Remove from queue
  for (const q of Object.values(state.queues)) {
    q.messages = q.messages.filter((m) => m.id !== messageId);
  }

  state.totalAcked++;
}

function handleNackOrReject(
  state: RabbitClusterState,
  event: RabbitSimEvent,
  emittedEvents: RabbitSimEvent[],
): void {
  const messageId = String(event.payload['messageId'] ?? '');
  const consumerId = String(event.payload['consumerId'] ?? '');
  const requeue = Boolean(event.payload['requeue'] ?? false);

  const consumer = state.consumers[consumerId];
  let targetMsg: AMQPMessage | undefined;

  if (consumer) {
    targetMsg = consumer.activeMessages.find((m) => m.id === messageId);
    consumer.activeMessages = consumer.activeMessages.filter((m) => m.id !== messageId);
  }

  state.totalNacked++;

  for (const q of Object.values(state.queues)) {
    const inQueueIdx = q.messages.findIndex((m) => m.id === messageId);
    if (inQueueIdx !== -1) {
      const msg = q.messages[inQueueIdx]!;
      if (requeue) {
        msg.state = 'InQueue';
        msg.assignedConsumerId = null;
        msg.retries++;
      } else {
        q.messages.splice(inQueueIdx, 1);
        if (q.deadLetterExchange) {
          routeToDLX(state, q, targetMsg ?? msg, 'RejectedWithoutRequeue', emittedEvents);
        }
      }
    }
  }
}

function routeToDLX(
  state: RabbitClusterState,
  sourceQueue: RabbitQueue,
  msg: AMQPMessage,
  reason: string,
  emittedEvents: RabbitSimEvent[],
): void {
  if (!sourceQueue.deadLetterExchange) return;
  const dlx = state.exchanges[sourceQueue.deadLetterExchange];
  if (!dlx) return;

  state.totalDeadLettered++;

  const dlxMatchingQueues = findMatchingQueues(state, dlx, sourceQueue.deadLetterRoutingKey ?? msg.routingKey);
  for (const qName of dlxMatchingQueues) {
    const targetQ = state.queues[qName];
    if (targetQ) {
      const dlxMsg: AMQPMessage = {
        ...msg,
        id: `dlx-${msg.id}`,
        state: 'DeadLettered',
        headers: { ...msg.headers, 'x-death-reason': reason },
      };
      targetQ.messages.push(dlxMsg);
      emittedEvents.push({
        id: `dead-letter-${dlxMsg.id}`,
        tick: state.tick,
        type: 'RABBIT_MESSAGE_DEAD_LETTERED',
        payload: { messageId: dlxMsg.id, reason, sourceQueue: sourceQueue.name },
      });
    }
  }
}

function handleTick(state: RabbitClusterState, emittedEvents: RabbitSimEvent[]): void {
  for (const q of Object.values(state.queues)) {
    const remainingMsgs: AMQPMessage[] = [];
    for (const msg of q.messages) {
      if (msg.ttl !== null) {
        msg.ttl--;
        if (msg.ttl <= 0) {
          if (q.deadLetterExchange) {
            routeToDLX(state, q, msg, 'ExpiredTTL', emittedEvents);
          }
          continue; // Evict expired
        }
      }
      remainingMsgs.push(msg);
    }
    q.messages = remainingMsgs;
  }
}

function dispatchMessagesToConsumers(state: RabbitClusterState): void {
  const consumers = Object.values(state.consumers) as RabbitConsumer[];

  for (const consumer of consumers) {
    if (consumer.status !== 'Active') continue;
    const q = state.queues[consumer.queueName];
    if (!q) continue;

    while (consumer.activeMessages.length < consumer.prefetchCount) {
      const nextMsg = q.messages.find((m) => m.state === 'InQueue' && m.assignedConsumerId === null);
      if (!nextMsg) break;

      nextMsg.state = 'Delivered';
      nextMsg.assignedConsumerId = consumer.id;
      consumer.activeMessages.push(nextMsg);
    }
  }
}
