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
  | 'rag'
  | 'agents'
  | 'llm-serving'
  | 'vectordb'
  | 'gpu-cluster';

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
    id: 'rag',
    name: 'Modular RAG',
    icon: '📚',
    category: 'Hybrid Retrieval & Lost-in-the-Middle',
    path: '/rag',
    color: '#38bdf8',
  },
  {
    id: 'agents',
    name: 'Agent Swarm',
    icon: '🤖',
    category: 'MCP Protocol & ReAct Monologue',
    path: '/agents',
    color: '#a855f7',
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
];
