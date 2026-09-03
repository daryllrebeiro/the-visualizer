'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Button,
  IconButton,
  Badge,
  StatusPill,
  Card,
  EmptyState,
  Skeleton,
  Toggle,
  Slider,
  Select,
  Tooltip,
  Modal,
  Drawer,
  Tabs,
  ProgressRing,
  Gauge,
  DOMAIN_COLORS,
} from '@the-visualizer/ui';

export default function DesignSystemPage(): React.JSX.Element {
  const [sliderVal, setSliderVal] = useState(65);
  const [toggleVal, setToggleVal] = useState(true);
  const [selectVal, setSelectVal] = useState('quorum');
  const [activeTab, setActiveTab] = useState('overview');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--bg-page, #f8fafc)',
        color: 'var(--text-primary, #0f172a)',
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: '32px',
      }}
    >
      {/* Header */}
      <header
        style={{
          maxWidth: '1100px',
          margin: '0 auto 32px auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Link
              href="/"
              style={{
                textDecoration: 'none',
                color: '#3b82f6',
                fontSize: '14px',
                fontWeight: 600,
              }}
            >
              ← Back to Platform
            </Link>
          </div>
          <h1 style={{ margin: '8px 0 4px 0', fontSize: '28px', fontWeight: 800 }}>
            TheVisualizer Design System
          </h1>
          <p style={{ margin: 0, color: 'var(--text-muted, #64748b)', fontSize: '14px' }}>
            Unified UI tokens, primitives, and component foundations across all 8 domain visualizers.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <StatusPill status="CONNECTED" />
          <StatusPill status="SANDBOX" />
        </div>
      </header>

      <section
        aria-label="Design System Components"
        style={{
          maxWidth: '1100px',
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '24px',
        }}
      >
        {/* Section: Domain Colors & Accents */}
        <Card padding="lg" style={{ gridColumn: '1 / -1' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 16px 0' }}>
            Domain Color Scales (8 Skins)
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' }}>
            {Object.entries(DOMAIN_COLORS).map(([key, theme]) => (
              <div
                key={key}
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  background: theme.subtle,
                  border: `1px solid ${theme.border}`,
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: theme.primary,
                    margin: '0 auto 8px auto',
                    boxShadow: theme.glow,
                  }}
                />
                <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'capitalize', color: theme.primary }}>
                  {key}
                </div>
                <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'monospace' }}>
                  {theme.primary}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Section: Buttons */}
        <Card padding="lg">
          <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 16px 0' }}>
            Buttons & IconButtons
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="danger">Danger</Button>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button variant="domain" domainColor={DOMAIN_COLORS['kafka']?.primary}>
                Kafka Action
              </Button>
              <Button variant="domain" domainColor={DOMAIN_COLORS['raft']?.primary}>
                Raft Action
              </Button>
              <Button variant="domain" domainColor={DOMAIN_COLORS['redis']?.primary}>
                Redis Action
              </Button>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <IconButton aria-label="Play" icon="▶️" />
              <IconButton aria-label="Pause" icon="⏸️" />
              <IconButton aria-label="Step" icon="⏭️" />
              <Button isLoading size="sm">
                Loading...
              </Button>
            </div>
          </div>
        </Card>

        {/* Section: Badges & Status */}
        <Card padding="lg">
          <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 16px 0' }}>
            Badges & Status Pills
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Badge variant="success" dot>LEADER</Badge>
              <Badge variant="warning" dot>CANDIDATE</Badge>
              <Badge variant="danger" dot>CRASHED</Badge>
              <Badge variant="info" dot>FOLLOWER</Badge>
              <Badge variant="purple">QUORUM</Badge>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <StatusPill status="CONNECTED" />
              <StatusPill status="SANDBOX" />
              <StatusPill status="CONNECTING" />
              <StatusPill status="ERROR" />
            </div>
            <div>
              <Tooltip content="Tooltip explaining ISR High Watermark invariant" position="top">
                <Badge variant="default" style={{ cursor: 'help' }}>
                  Hover for Tooltip ℹ️
                </Badge>
              </Tooltip>
            </div>
          </div>
        </Card>

        {/* Section: Form Controls & Sliders */}
        <Card padding="lg">
          <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 16px 0' }}>
            Form Controls & Metrics
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Slider
              label="Replication Cadence"
              value={sliderVal}
              onChange={setSliderVal}
              min={0}
              max={100}
              valueFormatter={(v) => `${v} ms`}
              domainColor="#3b82f6"
            />
            <Toggle
              checked={toggleVal}
              onChange={setToggleVal}
              label="Auto-produce packets"
              domainColor="#10b981"
            />
            <Select
              label="Consistency Level"
              value={selectVal}
              onChange={setSelectVal}
              options={[
                { value: 'one', label: 'ONE (Fastest, weak consistency)' },
                { value: 'quorum', label: 'QUORUM (R + W > N, strong)' },
                { value: 'all', label: 'ALL (Strict consistency, highest latency)' },
              ]}
            />
          </div>
        </Card>

        {/* Section: Progress & Gauges */}
        <Card padding="lg">
          <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 16px 0' }}>
            Progress Rings & Linear Gauges
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
              <ProgressRing value={sliderVal} color="#10b981" label={`${sliderVal}%`} size={54} />
              <ProgressRing value={85} color="#ef4444" label="85%" size={54} />
              <ProgressRing value={42} color="#8b5cf6" label="42%" size={54} />
            </div>
            <Gauge label="Broker Disk Capacity" value={78} color="#f59e0b" />
            <Gauge label="Memory Eviction Pool" value={sliderVal} color="#3b82f6" />
          </div>
        </Card>

        {/* Section: Tabs & Skeletons */}
        <Card padding="lg">
          <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 16px 0' }}>
            Tabs & Skeletons
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Tabs
              activeTab={activeTab}
              onChange={setActiveTab}
              variant="segmented"
              tabs={[
                { id: 'overview', label: 'Overview' },
                { id: 'state', label: 'Live State' },
                { id: 'history', label: 'Event History' },
              ]}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <Skeleton width="100%" height="20px" />
              <Skeleton width="75%" height="16px" />
              <Skeleton width="45%" height="16px" />
            </div>
          </div>
        </Card>

        {/* Section: Modal & Drawer Triggers */}
        <Card padding="lg">
          <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 16px 0' }}>
            Modals & Drawers
          </h3>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={() => setIsModalOpen(true)}>
              Open Demo Modal
            </Button>
            <Button variant="secondary" onClick={() => setIsDrawerOpen(true)}>
              Open Inspector Drawer
            </Button>
          </div>
        </Card>
      </section>

      {/* Demo Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Scenario Playbook Runner"
        subtitle="Step-by-step guided simulation with invariant assertions"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => setIsModalOpen(false)}>
              Start Scenario
            </Button>
          </>
        }
      >
        <EmptyState
          icon="🚀"
          title="Ready to run Kafka Rolling Restart scenario"
          description="This playbook gracefully restarts 3 brokers sequentially and tests partition high-watermark convergence."
        />
      </Modal>

      {/* Demo Drawer */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title="Entity Inspector: broker-1"
        subtitle="Kafka Broker Node (Rack: us-east-1a)"
        footer={
          <Button variant="danger" style={{ width: '100%' }}>
            ⚡ Force Kill Broker
          </Button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Gauge label="CPU Utilization" value={34} color="#10b981" />
          <Gauge label="Partition Log Segments" value={82} color="#3b82f6" />
          <div style={{ fontSize: '13px', color: '#64748b' }}>
            <strong>Assigned Leader Partitions:</strong> orders-0, payments-1, telemetry-2
          </div>
        </div>
      </Drawer>
    </main>
  );
}
