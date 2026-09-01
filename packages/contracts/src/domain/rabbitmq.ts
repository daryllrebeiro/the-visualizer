import { z } from 'zod';

export const ExchangeTypeSchema = z.enum(['direct', 'fanout', 'topic', 'headers']);
export type ExchangeType = z.infer<typeof ExchangeTypeSchema>;

export const ExchangeSpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: ExchangeTypeSchema,
  durable: z.boolean().default(true),
  autoDelete: z.boolean().default(false),
  color: z.string(),
});
export type ExchangeSpec = z.infer<typeof ExchangeSpecSchema>;

export const BindingSpecSchema = z.object({
  id: z.string().min(1),
  exchangeName: z.string().min(1),
  queueName: z.string().min(1),
  routingKeyPattern: z.string().default(''), // e.g. "orders.*.eu", "logs.#"
});
export type BindingSpec = z.infer<typeof BindingSpecSchema>;

export const AMQPMessageStateSchema = z.enum([
  'InExchange',
  'InQueue',
  'Delivered',
  'Acked',
  'DeadLettered',
]);
export type AMQPMessageState = z.infer<typeof AMQPMessageStateSchema>;

export const AMQPMessageSchema = z.object({
  id: z.string().min(1),
  payload: z.string(),
  routingKey: z.string(),
  headers: z.record(z.string(), z.string()).default({}),
  ttl: z.number().int().positive().nullable().default(null),
  retries: z.number().int().nonnegative().default(0),
  createdAtTick: z.number().nonnegative(),
  state: AMQPMessageStateSchema,
  assignedConsumerId: z.string().nullable().default(null),
});
export type AMQPMessage = z.infer<typeof AMQPMessageSchema>;

export const RabbitQueueSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  durable: z.boolean().default(true),
  deadLetterExchange: z.string().nullable().default(null),
  deadLetterRoutingKey: z.string().nullable().default(null),
  maxQueueLength: z.number().int().positive().default(50),
  messageTtl: z.number().int().positive().nullable().default(null),
  messages: z.array(AMQPMessageSchema).default([]),
  consumerCount: z.number().int().nonnegative().default(0),
  color: z.string(),
});
export type RabbitQueue = z.infer<typeof RabbitQueueSchema>;

export const RabbitConsumerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  queueName: z.string().min(1),
  prefetchCount: z.number().int().positive().default(1),
  activeMessages: z.array(AMQPMessageSchema).default([]),
  status: z.enum(['Active', 'Paused']).default('Active'),
});
export type RabbitConsumer = z.infer<typeof RabbitConsumerSchema>;

export const RabbitClusterStateSchema = z.object({
  clusterId: z.string(),
  tick: z.number().nonnegative(),
  rngState: z.number().int(),
  exchanges: z.record(z.string(), ExchangeSpecSchema),
  queues: z.record(z.string(), RabbitQueueSchema),
  bindings: z.record(z.string(), BindingSpecSchema),
  consumers: z.record(z.string(), RabbitConsumerSchema),
  totalPublished: z.number().int().nonnegative().default(0),
  totalAcked: z.number().int().nonnegative().default(0),
  totalNacked: z.number().int().nonnegative().default(0),
  totalDeadLettered: z.number().int().nonnegative().default(0),
});
export type RabbitClusterState = z.infer<typeof RabbitClusterStateSchema>;
