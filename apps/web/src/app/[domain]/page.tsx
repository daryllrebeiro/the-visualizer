import React from 'react';

import VisualizerApp from '../VisualizerApp';

interface PageProps {
  params: Promise<{ domain: string }>;
}

export function generateStaticParams(): Array<{ domain: string }> {
  return [
    { domain: 'kafka' },
    { domain: 'raft' },
    { domain: 'database' },
    { domain: 'redis' },
    { domain: 'kubernetes' },
    { domain: 'rabbitmq' },
    { domain: 'storage' },
    { domain: 'networking' },
    { domain: 'rate-limiter' },
    { domain: 'distributed-lock' },
    { domain: 'cdn-cache' },
    { domain: 'id-gen' },
    { domain: 'transactions' },
    { domain: 'llm-pipeline' },
    { domain: 'llm-gateway' },
    { domain: 'llm-serving' },
    { domain: 'vectordb' },
    { domain: 'gpu-cluster' },
  ];
}

export default async function DomainPage({ params }: PageProps): Promise<React.JSX.Element> {
  const resolvedParams = await params;
  const validDomains = [
    'kafka',
    'raft',
    'database',
    'redis',
    'kubernetes',
    'rabbitmq',
    'storage',
    'networking',
    'rate-limiter',
    'distributed-lock',
    'cdn-cache',
    'id-gen',
    'transactions',
    'llm-pipeline',
    'llm-gateway',
    'llm-serving',
    'vectordb',
    'gpu-cluster',
  ] as const;
  type DomainType = (typeof validDomains)[number];

  const domain = validDomains.includes(resolvedParams.domain as DomainType)
    ? (resolvedParams.domain as DomainType)
    : 'kafka';

  return <VisualizerApp initialDomain={domain} />;
}
