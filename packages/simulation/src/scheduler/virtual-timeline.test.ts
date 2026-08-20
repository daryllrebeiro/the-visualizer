import { describe, expect, it } from 'vitest';

import { VirtualTimeline } from './virtual-timeline.js';

describe('VirtualTimeline', () => {
  it('should maintain chronological execution order', () => {
    const timeline = new VirtualTimeline<string>();

    timeline.schedule({ id: 'e1', scheduledAt: 10, payload: 'Ten' });
    timeline.schedule({ id: 'e2', scheduledAt: 5, payload: 'Five' });
    timeline.schedule({ id: 'e3', scheduledAt: 15, payload: 'Fifteen' });

    expect(timeline.size).toBe(3);

    const first = timeline.pop();
    expect(first?.payload).toBe('Five');
    expect(timeline.currentTick).toBe(5);

    const second = timeline.pop();
    expect(second?.payload).toBe('Ten');
    expect(timeline.currentTick).toBe(10);

    const third = timeline.pop();
    expect(third?.payload).toBe('Fifteen');
    expect(timeline.currentTick).toBe(15);

    expect(timeline.isEmpty).toBe(true);
  });

  it('should reject scheduling in the past', () => {
    const timeline = new VirtualTimeline<string>();
    timeline.schedule({ id: 'e1', scheduledAt: 10, payload: 'Future' });
    timeline.pop(); // advances timeline to tick 10

    expect(() => {
      timeline.schedule({ id: 'e2', scheduledAt: 5, payload: 'Past' });
    }).toThrow(/Cannot schedule event at tick 5: current tick is 10/);
  });
});
