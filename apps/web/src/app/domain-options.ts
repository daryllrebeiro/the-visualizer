/* ─── Domain configuration ─── */
export type DomainKey =
  | 'kafka'
  | 'raft'
  | 'database'
  | 'redis'
  | 'kubernetes'
  | 'rabbitmq'
  | 'storage'
  | 'networking'
  | 'rate-limiter'
  | 'distributed-lock'
  | 'cdn-cache'
  | 'id-gen'
  | 'transactions'
  | 'llm-serving'
  | 'vectordb'
  | 'gpu-cluster'
  | 'llm-pipeline'
  | 'llm-gateway'
  | 'load-balancer'
  | 'search-index'
  | 'task-scheduler'
  | 'chat-presence'
  | 'feature-store'
  | 'model-rollout'
  | 'llm-eval'
  | 'consistent-hashing'
  | 'probabilistic-structures'
  | 'merkle-trees';

export const DOMAIN_OPTIONS: ReadonlyArray<{
  id: DomainKey;
  name: string;
  icon: string;
  category: string;
  path: string;
  color: string;
}> = [
  {
    id: 'kafka',
    name: 'Apache Kafka',
    icon: '⚡',
    category: 'Streaming & KRaft',
    path: '/kafka',
    color: '#6366f1',
  },
  {
    id: 'raft',
    name: 'Raft Consensus',
    icon: '🛡️',
    category: 'Leader Election & Quorum',
    path: '/raft',
    color: '#eab308',
  },
  {
    id: 'database',
    name: 'Distributed DB',
    icon: '🗄️',
    category: 'Consistent Hashing & Dynamo',
    path: '/database',
    color: '#10b981',
  },
  {
    id: 'redis',
    name: 'Redis Cluster',
    icon: '⚡',
    category: 'CRC16 Slots & Evictions',
    path: '/redis',
    color: '#ef4444',
  },
  {
    id: 'kubernetes',
    name: 'Kubernetes',
    icon: '☸️',
    category: 'Reconciliation & Scheduling',
    path: '/kubernetes',
    color: '#3b82f6',
  },
  {
    id: 'rabbitmq',
    name: 'RabbitMQ',
    icon: '🐇',
    category: 'AMQP & Dead Letter Queues',
    path: '/rabbitmq',
    color: '#f97316',
  },
  {
    id: 'storage',
    name: 'Storage Engine',
    icon: '💾',
    category: 'B+ Tree vs LSM Compaction',
    path: '/storage',
    color: '#14b8a6',
  },
  {
    id: 'networking',
    name: 'TCP Networking',
    icon: '🌐',
    category: '3-Way Handshake & AIMD',
    path: '/networking',
    color: '#06b6d4',
  },
  {
    id: 'rate-limiter',
    name: 'Rate Limiter',
    icon: '⏱️',
    category: 'Token Bucket & Sliding Log',
    path: '/rate-limiter',
    color: '#0ea5e9',
  },
  {
    id: 'distributed-lock',
    name: 'Distributed Lock',
    icon: '🔒',
    category: 'Redlock Quorum & Fencing',
    path: '/distributed-lock',
    color: '#f59e0b',
  },
  {
    id: 'cdn-cache',
    name: 'CDN Cache',
    icon: '🌍',
    category: 'Edge PoPs & HTTP Caching',
    path: '/cdn-cache',
    color: '#10b981',
  },
  {
    id: 'id-gen',
    name: 'ID Generation',
    icon: '🔢',
    category: 'Snowflake & Monotonic UUID',
    path: '/id-gen',
    color: '#8b5cf6',
  },
  {
    id: 'transactions',
    name: 'Distributed Txns',
    icon: '🔄',
    category: '2PC Hazard vs Saga Orchestration',
    path: '/transactions',
    color: '#ec4899',
  },
  {
    id: 'llm-serving',
    name: 'LLM Serving',
    icon: '🧠',
    category: 'PagedAttention & Continuous Batching',
    path: '/llm-serving',
    color: '#10b981',
  },
  {
    id: 'vectordb',
    name: 'Vector Database',
    icon: '🔍',
    category: 'HNSW Graph & Product Quantization',
    path: '/vectordb',
    color: '#f59e0b',
  },
  {
    id: 'gpu-cluster',
    name: 'GPU Cluster',
    icon: '🖥️',
    category: '3D Parallelism & 1F1B Schedule',
    path: '/gpu-cluster',
    color: '#ef4444',
  },
  {
    id: 'llm-pipeline',
    name: 'LLM Pipeline',
    icon: '🧬',
    category: 'ETL, RAG & Lineage (PIPE-8)',
    path: '/llm-pipeline',
    color: '#06b6d4',
  },
  {
    id: 'llm-gateway',
    name: 'LLM Gateway',
    icon: '🛡️',
    category: 'Routing, Semantic Cache & Guardrails (GW-1)',
    path: '/llm-gateway',
    color: '#3b82f6',
  },
  {
    id: 'load-balancer',
    name: 'Load Balancer',
    icon: '⚖️',
    category: 'L4/L7 Routing & Health Checks',
    path: '/load-balancer',
    color: '#3b82f6',
  },
  {
    id: 'search-index',
    name: 'Search Index',
    icon: '🔍',
    category: 'Inverted Index & BM25 Scoring',
    path: '/search-index',
    color: '#f59e0b',
  },
  {
    id: 'task-scheduler',
    name: 'Task Scheduler',
    icon: '⏰',
    category: 'Distributed Cron & DAG Ordering',
    path: '/task-scheduler',
    color: '#10b981',
  },
  {
    id: 'chat-presence',
    name: 'Chat & Presence',
    icon: '💬',
    category: 'WebSocket Ordering & Fanout',
    path: '/chat-presence',
    color: '#06b6d4',
  },
  {
    id: 'feature-store',
    name: 'Feature Store',
    icon: '🗄️',
    category: 'Point-in-Time Joins & Freshness',
    path: '/feature-store',
    color: '#8b5cf6',
  },
  {
    id: 'model-rollout',
    name: 'Model Rollout',
    icon: '🚀',
    category: 'Canary Deploy & Auto Rollback',
    path: '/model-rollout',
    color: '#ec4899',
  },
  {
    id: 'llm-eval',
    name: 'LLM Eval Suite',
    icon: '🧪',
    category: 'Red-Team Regressions & Gate',
    path: '/llm-eval',
    color: '#ef4444',
  },
  {
    id: 'consistent-hashing',
    name: 'Consistent Hashing',
    icon: '🌀',
    category: 'Ring vs Jump vs Rendezvous',
    path: '/consistent-hashing',
    color: '#f59e0b',
  },
  {
    id: 'probabilistic-structures',
    name: 'Probabilistic DS',
    icon: '🎲',
    category: 'Bloom, Cuckoo, HLL, CMS',
    path: '/probabilistic-structures',
    color: '#10b981',
  },
  {
    id: 'merkle-trees',
    name: 'Merkle Trees',
    icon: '🌳',
    category: 'Proofs & Anti-Entropy Repair',
    path: '/merkle-trees',
    color: '#06b6d4',
  },
];
