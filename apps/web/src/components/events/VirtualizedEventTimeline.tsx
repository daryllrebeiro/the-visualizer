'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { EventLogItem } from '../../app/ws-client';
import { EventTimelineItem } from './EventTimelineItem';

interface VirtualizedEventTimelineProps {
  events: EventLogItem[];
  emptyMessage?: string;
  entityTitle?: string;
  itemHeight?: number;
}

export function VirtualizedEventTimeline({
  events,
  emptyMessage = 'No historical events recorded for this entity yet.',
  entityTitle,
  itemHeight = 44,
}: VirtualizedEventTimelineProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(400);
  const [searchFilter, setSearchFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'PRODUCED' | 'CONSUMED' | 'CHAOS' | 'REBALANCE'>('ALL');
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const lastSeenCountRef = useRef(events.length);

  // Measure container height dynamically
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.height > 0) {
          setContainerHeight(entry.contentRect.height);
        }
      }
    });

    resizeObserver.observe(container);
    setContainerHeight(container.clientHeight || 400);

    return () => resizeObserver.disconnect();
  }, []);

  // Filter events based on search query and type filter
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      // Type filter
      if (typeFilter === 'PRODUCED' && !e.message.toLowerCase().includes('produce') && e.eventType !== 'RECORD_PRODUCED') {
        return false;
      }
      if (typeFilter === 'CONSUMED' && !e.message.toLowerCase().includes('consum') && e.eventType !== 'RECORD_CONSUMED') {
        return false;
      }
      if (typeFilter === 'CHAOS' && !e.message.toLowerCase().includes('crash') && !e.message.toLowerCase().includes('recover') && e.eventType !== 'BROKER_STATUS_CHANGED') {
        return false;
      }
      if (typeFilter === 'REBALANCE' && !e.message.toLowerCase().includes('rebalance') && !e.message.toLowerCase().includes('join') && e.eventType !== 'REBALANCE_STARTED' && e.eventType !== 'CONSUMER_JOINED') {
        return false;
      }

      // Keyword search
      if (searchFilter.trim()) {
        const query = searchFilter.toLowerCase();
        const matchesMsg = e.message.toLowerCase().includes(query);
        const matchesType = (e.eventType || e.type).toLowerCase().includes(query);
        const matchesEntity = e.involvedEntities?.some((ent) => `${ent.type}:${ent.id}`.toLowerCase().includes(query));
        return matchesMsg || matchesType || matchesEntity;
      }

      return true;
    });
  }, [events, searchFilter, typeFilter]);

  // Handle scroll events to manage auto-scroll & virtualization
  const handleScroll = (e: React.UIEvent<HTMLDivElement>): void => {
    const target = e.currentTarget;
    setScrollTop(target.scrollTop);

    const isNearBottom = target.scrollHeight - target.scrollTop - target.clientHeight <= 40;
    if (isNearBottom) {
      setIsAutoScrollEnabled(true);
      setUnreadCount(0);
      lastSeenCountRef.current = events.length;
    } else {
      setIsAutoScrollEnabled(false);
    }
  };

  // Auto-scroll on real-time append if enabled
  useEffect(() => {
    if (isAutoScrollEnabled) {
      const container = containerRef.current;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
      lastSeenCountRef.current = events.length;
      setUnreadCount(0);
    } else {
      const diff = events.length - lastSeenCountRef.current;
      if (diff > 0) {
        setUnreadCount(diff);
      }
    }
  }, [events.length, isAutoScrollEnabled]);

  const scrollToBottom = (): void => {
    const container = containerRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
    setIsAutoScrollEnabled(true);
    setUnreadCount(0);
    lastSeenCountRef.current = events.length;
  };

  // Virtualization Window Computation
  const totalCount = filteredEvents.length;
  const totalHeight = totalCount * itemHeight;
  const overscan = 6;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    totalCount,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan,
  );

  const visibleItems = filteredEvents.slice(startIndex, endIndex);

  return (
    <div className="virtualized-timeline-wrapper">
      {/* Filter & Toolbar Header */}
      <div className="timeline-toolbar">
        <div className="timeline-search-row">
          <input
            type="text"
            className="timeline-search-input"
            placeholder="🔍 Filter timeline events by keyword, ID, or type..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
          />
          {searchFilter && (
            <button
              onClick={() => setSearchFilter('')}
              className="timeline-filter-clear-btn"
              title="Clear search filter"
            >
              ✕
            </button>
          )}
        </div>

        <div className="timeline-pills-row">
          {(['ALL', 'PRODUCED', 'CONSUMED', 'CHAOS', 'REBALANCE'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setTypeFilter(cat)}
              className={`timeline-pill ${typeFilter === cat ? 'timeline-pill--active' : ''}`}
            >
              {cat}
            </button>
          ))}
          <span className="timeline-count-badge">
            {filteredEvents.length} {filteredEvents.length === 1 ? 'event' : 'events'}
          </span>
        </div>
      </div>

      {/* Virtualized Scrolling Container */}
      <div
        ref={containerRef}
        className="virtualized-timeline-container"
        onScroll={handleScroll}
      >
        {totalCount === 0 ? (
          <div className="timeline-empty-state">
            <span className="timeline-empty-icon">📜</span>
            <p className="timeline-empty-text">{emptyMessage}</p>
            {entityTitle && (
              <span className="timeline-empty-sub">
                Waiting for actions involving {entityTitle}...
              </span>
            )}
          </div>
        ) : (
          <div
            className="virtualized-timeline-phantom"
            style={{ height: `${String(totalHeight)}px`, position: 'relative' }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                transform: `translateY(${String(startIndex * itemHeight)}px)`,
              }}
            >
              {visibleItems.map((evt) => (
                <EventTimelineItem
                  key={evt.id}
                  event={evt}
                  style={{ minHeight: `${String(itemHeight)}px` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Jump to Latest Floating Button */}
      {!isAutoScrollEnabled && unreadCount > 0 && (
        <button onClick={scrollToBottom} className="timeline-jump-btn">
          ⬇ Jump to Latest ({unreadCount} new)
        </button>
      )}
    </div>
  );
}
