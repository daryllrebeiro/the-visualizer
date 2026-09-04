import React from 'react';

import { Tooltip } from '../primitives/Tooltip.js';

export const GLOSSARY_TERMS: Record<
  string,
  { term: string; category: string; definition: string }
> = {
  ISR: {
    term: 'In-Sync Replicas (ISR)',
    category: 'Kafka',
    definition:
      "The subset of partition replicas that are actively caught up to the leader's log end offset (LEO) within the replica.lag.time.max.ms threshold.",
  },
  HW: {
    term: 'High Watermark (HW)',
    category: 'Kafka',
    definition:
      'The highest log offset committed and replicated across all in-sync replicas (ISR). Consumers can only read up to this offset.',
  },
  LEO: {
    term: 'Log End Offset (LEO)',
    category: 'Kafka',
    definition:
      'The offset of the next record to be written into the partition log by the partition leader.',
  },
  TERM: {
    term: 'Raft Term',
    category: 'Raft',
    definition:
      'Monotonically increasing logical epoch number acting as a logical clock to detect stale leaders and split-brain scenarios.',
  },
  COMMIT_INDEX: {
    term: 'Raft Commit Index',
    category: 'Raft',
    definition:
      'Index of highest log entry known to be replicated across a strict quorum majority of cluster nodes.',
  },
  VNODE: {
    term: 'Virtual Node (vnode)',
    category: 'Distributed DB',
    definition:
      'Multiple discrete token positions on the consistent hash ring assigned to a single physical node to ensure uniform data distribution.',
  },
  QUORUM: {
    term: 'Quorum Overlap (R + W > N)',
    category: 'Distributed DB',
    definition:
      'Condition guaranteeing strong read-your-writes consistency: the read quorum (R) plus write quorum (W) strictly exceeds replication factor (N).',
  },
  SLOT: {
    term: 'Hash Slot (0..16383)',
    category: 'Redis Cluster',
    definition:
      'One of 16,384 deterministic data buckets assigned across Redis masters computed as CRC16(key) mod 16384.',
  },
  EVICTION_LRU: {
    term: 'Least Recently Used (LRU)',
    category: 'Redis / Cache',
    definition:
      'Memory management policy that evicts keys with the oldest idle access timestamp when maxmemory limit is reached.',
  },
  RECONCILIATION: {
    term: 'Reconciliation Loop',
    category: 'Kubernetes',
    definition:
      'Level-triggered control loop that observes actual cluster state, computes the diff against desired spec, and applies convergence actions.',
  },
  DLQ: {
    term: 'Dead-Letter Queue (DLQ)',
    category: 'RabbitMQ',
    definition:
      "A queue that captures rejected, nack'd, or TTL-expired poison messages from an AMQP exchange for diagnostic inspection.",
  },
  MEMTABLE: {
    term: 'MemTable (SkipList)',
    category: 'Storage Engine',
    definition:
      'In-memory sorted write buffer in an LSM-tree. Writes are appended to the WAL and inserted into MemTable before being flushed to immutable Level 0 SSTables.',
  },
  BLOOM_FILTER: {
    term: 'Bloom Filter',
    category: 'Storage Engine',
    definition:
      'Space-efficient probabilistic data structure that tests set membership with zero false negatives (if lookup returns false, key definitively does not exist).',
  },
  CWND: {
    term: 'Congestion Window (cwnd)',
    category: 'TCP Networking',
    definition:
      'TCP state variable limiting the number of in-flight unacknowledged bytes on the wire, governed by AIMD slow-start and congestion avoidance.',
  },
  AIMD: {
    term: 'Additive Increase / Multiplicative Decrease (AIMD)',
    category: 'TCP Networking',
    definition:
      'Congestion control algorithm that increases cwnd linearly (+1 MSS per RTT) and cuts cwnd in half upon detecting packet loss.',
  },
};

export interface GlossaryTooltipProps {
  termKey: keyof typeof GLOSSARY_TERMS;
  children?: React.ReactNode;
}

export const GlossaryTooltip: React.FC<GlossaryTooltipProps> = ({ termKey, children }) => {
  const info = GLOSSARY_TERMS[termKey];
  if (!info) return <>{children}</>;

  const content = (
    <div style={{ maxWidth: '280px', padding: '4px', textAlign: 'left' }}>
      <div style={{ fontWeight: 700, color: '#38bdf8', fontSize: '11px', marginBottom: '2px' }}>
        [{info.category}] {info.term}
      </div>
      <div style={{ fontSize: '11px', color: '#e2e8f0', lineHeight: 1.4 }}>{info.definition}</div>
    </div>
  );

  return (
    <Tooltip content={content} position="top" delay={100}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
          cursor: 'help',
          borderBottom: '1px dotted #94a3b8',
        }}
      >
        {children ?? info.term}
        <span style={{ fontSize: '10px', color: '#38bdf8', opacity: 0.8 }}>ℹ️</span>
      </span>
    </Tooltip>
  );
};
