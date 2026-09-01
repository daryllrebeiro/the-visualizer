'use client';

import React from 'react';

export interface ScenarioDefinition {
  id: string;
  title: string;
  badge: string;
  description: string;
  steps: string[];
  actionLabel: string;
  run: () => void;
}

interface ScenarioRunnerProps {
  onRunScenario: (scenarioId: string) => void;
  onOpenTraceImport?: () => void;
  onClose: () => void;
}

export function ScenarioRunner({
  onRunScenario,
  onOpenTraceImport,
  onClose,
}: ScenarioRunnerProps): React.JSX.Element {
  const scenarios: {
    id: string;
    title: string;
    badge: string;
    description: string;
    steps: string[];
    actionLabel: string;
  }[] = [
    {
      id: 'leader-failover',
      title: 'Leader Failover & In-Sync Replica Promotion',
      badge: 'High Availability',
      description:
        'Simulates an abrupt hardware crash on Partition Leader Broker 1. The KRaft Controller detects heartbeat loss, promotes an alive in-sync follower, and updates ISR.',
      steps: [
        '1. Chaos: Kill Leader Broker 1.',
        '2. KRaft: Elect In-Sync Follower as new Partition Leader.',
        '3. Cluster: Shrink ISR and continue accepting writes.',
      ],
      actionLabel: '▶ Run Failover Simulation',
    },
    {
      id: 'cooperative-rebalance',
      title: 'Consumer Group Cooperative Sticky Rebalance',
      badge: 'KIP-848',
      description:
        'Adds a new consumer member into an active consumer group. The group coordinator computes incremental partition assignments without a stop-the-world freeze.',
      steps: [
        '1. Join: Add Consumer-2 to group.',
        '2. Coordinator: Rebalance partitions smoothly.',
        '3. Verify: Workload distributed across all consumers.',
      ],
      actionLabel: '▶ Run Rebalance Simulation',
    },
    {
      id: 'kraft-controller-failover',
      title: 'KRaft Metadata Quorum Controller Failover',
      badge: 'KRaft Quorum',
      description:
        'Crashes the active metadata controller broker. The voter quorum elects a new active controller and increments the controller epoch.',
      steps: [
        '1. Crash: Active Controller Node.',
        '2. Vote: Quorum elects successor controller.',
        '3. Epoch: Controller epoch increments.',
      ],
      actionLabel: '▶ Run Controller Election',
    },
  ];

  return (
    <div className="inspector-backdrop" onClick={onClose}>
      <div className="scenario-modal" onClick={(e) => e.stopPropagation()}>
        <header className="scenario-modal__header">
          <div>
            <span className="inspector-badge inspector-badge--primary">EDUCATIONAL PLAYBOOKS</span>
            <h2 className="scenario-modal__title">Interactive Kafka Scenarios</h2>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {onOpenTraceImport && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenTraceImport();
                }}
                className="btn btn--secondary"
                style={{ fontSize: '0.8rem', padding: '6px 12px' }}
              >
                📥 Import Trace File
              </button>
            )}
            <button onClick={onClose} className="inspector-close-btn" aria-label="Close modal">
              ✕
            </button>
          </div>
        </header>

        <div className="scenario-grid">
          {scenarios.map((sc) => (
            <div key={sc.id} className="scenario-card">
              <div className="scenario-card__header">
                <span className="scenario-card__badge">{sc.badge}</span>
                <h3 className="scenario-card__title">{sc.title}</h3>
              </div>
              <p className="scenario-card__desc">{sc.description}</p>
              <div className="scenario-card__steps">
                {sc.steps.map((st, idx) => (
                  <div key={idx} className="scenario-step-item">
                    {st}
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  onRunScenario(sc.id);
                  onClose();
                }}
                className="btn btn--indigo btn--full"
              >
                {sc.actionLabel}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
