'use client';

import React, { useState } from 'react';
import type { EventLogItem } from '../../app/ws-client';

interface EventTimelineItemProps {
  event: EventLogItem;
  style?: React.CSSProperties;
}

export function EventTimelineItem({ event, style }: EventTimelineItemProps): React.JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false);

  const formattedTime = new Date(event.timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });

  const getBadgeClass = (type: EventLogItem['type']): string => {
    switch (type) {
      case 'SUCCESS':
        return 'log-badge log-badge--success';
      case 'WARN':
        return 'log-badge log-badge--warn';
      case 'ERROR':
        return 'log-badge log-badge--error';
      default:
        return 'log-badge log-badge--info';
    }
  };

  return (
    <div
      style={style}
      className={`timeline-entry timeline-entry--${event.type.toLowerCase()} ${isExpanded ? 'timeline-entry--expanded' : ''}`}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="timeline-entry__main-row">
        <span className="timeline-entry__time">{formattedTime}</span>

        {event.tick !== undefined && (
          <span className="timeline-entry__tick-badge">T+{String(event.tick)}</span>
        )}

        <span className={getBadgeClass(event.type)}>
          {event.eventType || event.type}
        </span>

        <span className="timeline-entry__msg">{event.message}</span>

        {event.involvedEntities && event.involvedEntities.length > 0 && (
          <div className="timeline-entry__entities">
            {event.involvedEntities.map((ent, idx) => (
              <span key={idx} className="timeline-entity-tag">
                {ent.type}:{ent.id}
              </span>
            ))}
          </div>
        )}

        <span className="timeline-entry__expand-icon" title="Toggle full payload details">
          {isExpanded ? '▲' : '▼'}
        </span>
      </div>

      {isExpanded && (
        <div className="timeline-entry__details" onClick={(e) => e.stopPropagation()}>
          <div className="timeline-entry__meta-grid">
            <div><strong>Event ID:</strong> <code>{event.id}</code></div>
            <div><strong>Timestamp:</strong> <code>{event.timestamp} ({new Date(event.timestamp).toISOString()})</code></div>
            {event.tick !== undefined && <div><strong>Simulation Tick:</strong> <code>{String(event.tick)}</code></div>}
            {event.eventType && <div><strong>Kafka Event Type:</strong> <code>{event.eventType}</code></div>}
          </div>

          {event.payload && Object.keys(event.payload).length > 0 && (
            <div className="timeline-entry__payload">
              <span className="timeline-payload-label">Payload Data:</span>
              <pre className="timeline-payload-json">
                {JSON.stringify(event.payload, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
