import React from 'react';
import { Modal } from '../primitives/Modal.js';
import { Button } from '../primitives/Button.js';

export interface DataTableRow {
  id: string;
  name: string;
  roleOrType: string;
  status: string;
  metrics: string;
}

export interface DataTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  domainName: string;
  rows: DataTableRow[];
  extraSummary?: string;
}

export const DataTableModal: React.FC<DataTableModalProps> = ({
  isOpen,
  onClose,
  domainName,
  rows,
  extraSummary,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${domainName} — Accessible Cluster State Table`}
      subtitle="Accessible non-canvas semantic table representation for screen readers and high-contrast audits"
      maxWidth="720px"
      footer={
        <Button variant="primary" onClick={onClose}>
          Close Table View
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontFamily: 'Inter, system-ui, sans-serif' }}>
        {extraSummary && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: '#f1f5f9',
              fontSize: '13px',
              color: '#334155',
            }}
          >
            {extraSummary}
          </div>
        )}

        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '13px',
              textAlign: 'left',
            }}
          >
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '10px 12px', fontWeight: 600, color: '#475569' }}>Entity ID</th>
                <th style={{ padding: '10px 12px', fontWeight: 600, color: '#475569' }}>Name / Label</th>
                <th style={{ padding: '10px 12px', fontWeight: 600, color: '#475569' }}>Role / Type</th>
                <th style={{ padding: '10px 12px', fontWeight: 600, color: '#475569' }}>Status</th>
                <th style={{ padding: '10px 12px', fontWeight: 600, color: '#475569' }}>Live Metrics</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                    No active entities recorded in cluster state.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
                      {row.id}
                    </td>
                    <td style={{ padding: '8px 12px', fontWeight: 500 }}>{row.name}</td>
                    <td style={{ padding: '8px 12px' }}>{row.roleOrType}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          background: row.status.toLowerCase().includes('alive') || row.status.toLowerCase().includes('running') || row.status.toLowerCase().includes('ready')
                            ? '#dcfce7'
                            : '#fee2e2',
                          color: row.status.toLowerCase().includes('alive') || row.status.toLowerCase().includes('running') || row.status.toLowerCase().includes('ready')
                            ? '#15803d'
                            : '#b91c1c',
                        }}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', color: '#64748b' }}>{row.metrics}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
};
