import { describe, expect, it } from 'vitest';

import { DEFAULT_TOUR_STEPS, GLOSSARY_TERMS, UI_VERSION } from './index.js';

describe('UI Package Design System & Exports', () => {
  it('exports UI version constant', () => {
    expect(UI_VERSION).toBe('0.3.0');
  });

  it('contains valid glossary definitions for distributed systems', () => {
    expect(Object.keys(GLOSSARY_TERMS).length).toBeGreaterThanOrEqual(10);
    expect(GLOSSARY_TERMS.ISR).toBeDefined();
    expect(GLOSSARY_TERMS.HW).toBeDefined();
    expect(GLOSSARY_TERMS.TERM).toBeDefined();
    expect(GLOSSARY_TERMS.QUORUM).toBeDefined();
  });

  it('contains onboarding tour steps', () => {
    expect(DEFAULT_TOUR_STEPS.length).toBeGreaterThanOrEqual(4);
    for (const step of DEFAULT_TOUR_STEPS) {
      expect(step.title).toBeDefined();
      expect(step.description).toBeDefined();
      expect(step.icon).toBeDefined();
    }
  });
});
