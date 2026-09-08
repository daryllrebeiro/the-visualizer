'use client';

import React from 'react';

import type { DomainKey } from '../../app/domain-options';
import { CdnCacheVisualizer } from '../cdn-cache/CdnCacheVisualizer';
import { HashRingVisualizer } from '../database/HashRingVisualizer';
import { DistributedLockVisualizer } from '../distributed-lock/DistributedLockVisualizer';
import { GpuClusterVisualizer } from '../gpu-cluster/GpuClusterVisualizer';
import { IdGenVisualizer } from '../id-gen/IdGenVisualizer';
import { K8sClusterVisualizer } from '../kubernetes/K8sClusterVisualizer';
import { LlmGatewayVisualizer } from '../llm-gateway/LlmGatewayVisualizer';
import { LlmPipelineVisualizer } from '../llm-pipeline/LlmPipelineVisualizer';
import { LlmServingVisualizer } from '../llm-serving/LlmServingVisualizer';
import { NetworkingVisualizer } from '../networking/NetworkingVisualizer';
import { NewDomainsPanel, type NewDomainId } from '../new-domains/NewDomainsPanel';
import { RabbitMQVisualizer } from '../rabbitmq/RabbitMQVisualizer';
import { RaftVisualizer } from '../raft/RaftVisualizer';
import { RateLimiterVisualizer } from '../rate-limiter/RateLimiterVisualizer';
import { RedisClusterVisualizer } from '../redis/RedisClusterVisualizer';
import { StorageEngineVisualizer } from '../storage/StorageEngineVisualizer';
import { TransactionsVisualizer } from '../transactions/TransactionsVisualizer';
import { VectordbVisualizer } from '../vectordb/VectordbVisualizer';

export interface DomainCanvasAdapterProps {
  selectedDomain: DomainKey;
  kafkaComponent: React.ReactNode;
  raft: React.ComponentProps<typeof RaftVisualizer>;
  database: React.ComponentProps<typeof HashRingVisualizer>;
  redis: React.ComponentProps<typeof RedisClusterVisualizer>;
  kubernetes: React.ComponentProps<typeof K8sClusterVisualizer>;
  rabbitmq: React.ComponentProps<typeof RabbitMQVisualizer>;
  storage: React.ComponentProps<typeof StorageEngineVisualizer>;
  networking: React.ComponentProps<typeof NetworkingVisualizer>;
  rateLimiter: React.ComponentProps<typeof RateLimiterVisualizer>;
  distributedLock: React.ComponentProps<typeof DistributedLockVisualizer>;
  cdnCache: React.ComponentProps<typeof CdnCacheVisualizer>;
  idGen: React.ComponentProps<typeof IdGenVisualizer>;
  transactions: React.ComponentProps<typeof TransactionsVisualizer>;
  llmServing: React.ComponentProps<typeof LlmServingVisualizer>;
  vectordb: React.ComponentProps<typeof VectordbVisualizer>;
  llmPipeline: React.ComponentProps<typeof LlmPipelineVisualizer>;
  llmGateway: React.ComponentProps<typeof LlmGatewayVisualizer>;
  gpuCluster: React.ComponentProps<typeof GpuClusterVisualizer>;
  /** Domains 19-28 batch (self-contained panel owning state + tick loop) */
  newDomain: {
    domainId: NewDomainId;
    isPaused: boolean;
    onHalt: (message: string) => void;
  };
}

export function DomainCanvasAdapter(props: DomainCanvasAdapterProps): React.JSX.Element | null {
  const { selectedDomain } = props;

  switch (selectedDomain) {
    case 'kafka':
      return <>{props.kafkaComponent}</>;
    case 'raft':
      return <RaftVisualizer {...props.raft} />;
    case 'database':
      return <HashRingVisualizer {...props.database} />;
    case 'redis':
      return <RedisClusterVisualizer {...props.redis} />;
    case 'kubernetes':
      return <K8sClusterVisualizer {...props.kubernetes} />;
    case 'rabbitmq':
      return <RabbitMQVisualizer {...props.rabbitmq} />;
    case 'storage':
      return <StorageEngineVisualizer {...props.storage} />;
    case 'networking':
      return <NetworkingVisualizer {...props.networking} />;
    case 'rate-limiter':
      return <RateLimiterVisualizer {...props.rateLimiter} />;
    case 'distributed-lock':
      return <DistributedLockVisualizer {...props.distributedLock} />;
    case 'cdn-cache':
      return <CdnCacheVisualizer {...props.cdnCache} />;
    case 'id-gen':
      return <IdGenVisualizer {...props.idGen} />;
    case 'transactions':
      return <TransactionsVisualizer {...props.transactions} />;
    case 'llm-serving':
      return <LlmServingVisualizer {...props.llmServing} />;
    case 'vectordb':
      return <VectordbVisualizer {...props.vectordb} />;
    case 'llm-pipeline':
      return <LlmPipelineVisualizer {...props.llmPipeline} />;
    case 'llm-gateway':
      return <LlmGatewayVisualizer {...props.llmGateway} />;
    case 'gpu-cluster':
      return <GpuClusterVisualizer {...props.gpuCluster} />;
    case 'load-balancer':
    case 'search-index':
    case 'task-scheduler':
    case 'chat-presence':
    case 'feature-store':
    case 'model-rollout':
    case 'llm-eval':
    case 'consistent-hashing':
    case 'probabilistic-structures':
    case 'merkle-trees':
      return <NewDomainsPanel {...props.newDomain} />;
    default:
      return null;
  }
}
