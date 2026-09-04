import React from 'react';

import Page from '../page';

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
  ] as const;
  type DomainType = (typeof validDomains)[number];

  const domain = validDomains.includes(resolvedParams.domain as DomainType)
    ? (resolvedParams.domain as DomainType)
    : 'kafka';

  return <Page initialDomain={domain} />;
}
