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
  ];
}

export default async function DomainPage({ params }: PageProps): Promise<React.JSX.Element> {
  const resolvedParams = await params;
  const validDomains = ['kafka', 'raft', 'database', 'redis', 'kubernetes', 'rabbitmq', 'storage', 'networking'] as const;
  type DomainType = (typeof validDomains)[number];
  
  const domain = validDomains.includes(resolvedParams.domain as DomainType)
    ? (resolvedParams.domain as DomainType)
    : 'kafka';

  return <Page initialDomain={domain} />;
}
