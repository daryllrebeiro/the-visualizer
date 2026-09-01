export type ExchangeType = 'direct' | 'fanout' | 'topic' | 'headers';

export interface ExchangeSpec {
  id: string;
  name: string;
  type: ExchangeType;
  durable: boolean;
  autoDelete: boolean;
  color: string;
}

export interface BindingSpec {
  id: string;
  exchangeName: string;
  queueName: string;
  routingKeyPattern: string; // e.g. "orders.*.eu", "logs.#"
}

export type AMQPMessageState =
  | 'InExchange'
  | 'InQueue'
  | 'Delivered'
  | 'Acked'
  | 'DeadLettered';

export interface AMQPMessage {
  id: string;
  payload: string;
  routingKey: string;
  headers: Record<string, string>;
  ttl: number | null;
  retries: number;
  createdAtTick: number;
  state: AMQPMessageState;
  assignedConsumerId: string | null;
}

export interface RabbitQueue {
  id: string;
  name: string;
  durable: boolean;
  deadLetterExchange: string | null;
  deadLetterRoutingKey: string | null;
  maxQueueLength: number;
  messageTtl: number | null;
  messages: AMQPMessage[];
  consumerCount: number;
  color: string;
}

export interface RabbitConsumer {
  id: string;
  name: string;
  queueName: string;
  prefetchCount: number;
  activeMessages: AMQPMessage[];
  status: 'Active' | 'Paused';
}

export interface RabbitClusterState {
  clusterId: string;
  tick: number;
  rngState: number;
  exchanges: Record<string, ExchangeSpec>;
  queues: Record<string, RabbitQueue>;
  bindings: Record<string, BindingSpec>;
  consumers: Record<string, RabbitConsumer>;
  totalPublished: number;
  totalAcked: number;
  totalNacked: number;
  totalDeadLettered: number;
}

export type RabbitEventType =
  | 'RABBIT_PUBLISH'
  | 'RABBIT_ACK'
  | 'RABBIT_NACK'
  | 'RABBIT_REJECT'
  | 'RABBIT_DECLARE_EXCHANGE'
  | 'RABBIT_DECLARE_QUEUE'
  | 'RABBIT_BIND_QUEUE'
  | 'RABBIT_REGISTER_CONSUMER'
  | 'RABBIT_TICK'
  | 'RABBIT_MESSAGE_DELIVERED'
  | 'RABBIT_MESSAGE_DEAD_LETTERED';

export interface RabbitSimEvent {
  id: string;
  tick: number;
  type: RabbitEventType;
  payload: Record<string, unknown>;
}

export interface RabbitPublishPayload {
  exchangeName: string;
  routingKey: string;
  payload: string;
  ttl?: number | null | undefined;
  headers?: Record<string, string> | undefined;
}
