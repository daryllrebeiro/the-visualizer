import type { CurriculumTrack } from '@the-visualizer/contracts';

/** Curated graduation tracks. Requirements reference scenario IDs, quiz banks, and interview scripts. */
export const CURRICULUM_TRACKS: CurriculumTrack[] = [
  {
    id: 'distributed-systems-fundamentals',
    title: 'Distributed Systems Fundamentals',
    description:
      'Consensus, replication, and failure handling across Raft, Kafka, Dynamo-style storage, and transactions. Graduate by completing guided scenarios, scoring 80%+ on each domain quiz, and passing the Raft and Dynamo interview walkthroughs.',
    requirements: [
      { kind: 'scenario', domainId: 'raft', refId: 'raft-election-race' },
      { kind: 'scenario', domainId: 'raft', refId: 'raft-split-brain-partition' },
      { kind: 'scenario', domainId: 'database', refId: 'db-quorum-race' },
      { kind: 'quiz-threshold', domainId: 'raft', refId: 'raft', threshold: 0.8 },
      { kind: 'quiz-threshold', domainId: 'kafka', refId: 'kafka', threshold: 0.8 },
      { kind: 'quiz-threshold', domainId: 'database', refId: 'database', threshold: 0.8 },
      { kind: 'quiz-threshold', domainId: 'transactions', refId: 'transactions', threshold: 0.8 },
      { kind: 'interview', refId: 'raft-leader-election' },
      { kind: 'interview', refId: 'dynamo-quorums' },
    ],
  },
  {
    id: 'ai-infra-foundations',
    title: 'AI Infra Foundations',
    description:
      'Retrieval, serving, and evaluation for LLM systems: RAG pipelines, vector search, PagedAttention serving, GPU parallelism, and guardrailed evals. Graduate with 75%+ quiz scores and the rate-limiter and Redis interview walkthroughs.',
    requirements: [
      { kind: 'scenario', domainId: 'llm-pipeline', refId: 'lost-in-middle' },
      { kind: 'quiz-threshold', domainId: 'rag', refId: 'rag', threshold: 0.75 },
      { kind: 'quiz-threshold', domainId: 'vectordb', refId: 'vectordb', threshold: 0.75 },
      { kind: 'quiz-threshold', domainId: 'llm-serving', refId: 'llm-serving', threshold: 0.75 },
      { kind: 'quiz-threshold', domainId: 'gpu-cluster', refId: 'gpu-cluster', threshold: 0.75 },
      { kind: 'quiz-threshold', domainId: 'llm-eval', refId: 'llm-eval', threshold: 0.75 },
      { kind: 'interview', refId: 'design-rate-limiter' },
      { kind: 'interview', refId: 'redis-failover' },
    ],
  },
  {
    id: 'algorithms-and-structures',
    title: 'Algorithms & Probabilistic Structures',
    description:
      'Ranking, hashing, and verification primitives: BM25 search, consistent hashing, Bloom filters and sketches, Merkle proofs, plus the caching and scheduling systems built on them.',
    requirements: [
      { kind: 'quiz-threshold', domainId: 'search-index', refId: 'search-index', threshold: 0.8 },
      { kind: 'quiz-threshold', domainId: 'consistent-hashing', refId: 'consistent-hashing', threshold: 0.8 },
      { kind: 'quiz-threshold', domainId: 'probabilistic-structures', refId: 'probabilistic-structures', threshold: 0.8 },
      { kind: 'quiz-threshold', domainId: 'merkle-trees', refId: 'merkle-trees', threshold: 0.8 },
      { kind: 'quiz-threshold', domainId: 'cdn-cache', refId: 'cdn-cache', threshold: 0.75 },
      { kind: 'quiz-threshold', domainId: 'load-balancer', refId: 'load-balancer', threshold: 0.75 },
      { kind: 'interview', refId: 'consistent-hashing-design' },
    ],
  },
];

export function trackById(id: string): CurriculumTrack | undefined {
  return CURRICULUM_TRACKS.find((t) => t.id === id);
}
