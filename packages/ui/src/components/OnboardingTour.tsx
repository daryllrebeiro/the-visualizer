import React, { useState, useEffect } from 'react';
import { Button } from '../primitives/Button.js';
import { Card } from '../primitives/Card.js';

export interface TourStep {
  title: string;
  description: string;
  icon: string;
  highlightTarget?: string;
}

export const DEFAULT_TOUR_STEPS: TourStep[] = [
  {
    icon: '🗺️',
    title: 'Welcome to TheVisualizer',
    description:
      'Explore and interact with production distributed systems in real time. Switch between 8 domain visualizers anytime via the top dropdown or ⌘K.',
  },
  {
    icon: '🎛️',
    title: 'Chaos Controls & Guided Scenarios',
    description:
      'Use the Left Rail to inject broker crashes, network split-brains, rolling updates, and key-value writes. Run guided scenarios to see multi-step failure recovery in action.',
  },
  {
    icon: '🔍',
    title: 'Deep Entity Inspector',
    description:
      'Click any broker, partition, pod, or queue to open the Right Inspector Drawer. Inspect disk segments, replication lags, ISR health, and Kafka Murmur2 byte breakdowns.',
  },
  {
    icon: '⏱️',
    title: 'Deterministic Time-Travel Scrubbing',
    description:
      'Every state transition is pure and deterministic. Scrub backwards through ticks, pause and step single events, or export/import raw JSON simulation traces.',
  },
];

export interface OnboardingTourProps {
  isOpen: boolean;
  onClose: () => void;
  steps?: TourStep[];
}

export const OnboardingTour: React.FC<OnboardingTourProps> = ({
  isOpen,
  onClose,
  steps = DEFAULT_TOUR_STEPS,
}) => {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const step = steps[currentStep] ?? steps[0]!;
  const isLast = currentStep === steps.length - 1;

  const handleNext = () => {
    if (isLast) {
      if (typeof window !== 'undefined') {
        localStorage.setItem('the-visualizer:onboarding-seen', 'true');
      }
      onClose();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 150,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.5)',
          backdropFilter: 'blur(3px)',
          animation: 'fadeIn 150ms ease-out',
        }}
      />

      {/* Tour Card Dialog */}
      <Card
        padding="lg"
        style={{
          position: 'relative',
          zIndex: 151,
          width: '100%',
          maxWidth: '480px',
          background: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          animation: 'scaleIn 180ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header Indicator */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', gap: '6px' }}>
            {steps.map((_, idx) => (
              <div
                key={idx}
                style={{
                  width: idx === currentStep ? '24px' : '8px',
                  height: '6px',
                  borderRadius: '3px',
                  backgroundColor: idx === currentStep ? '#3b82f6' : '#e2e8f0',
                  transition: 'all 200ms ease',
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>
            Step {currentStep + 1} of {steps.length}
          </span>
        </div>

        {/* Content Body */}
        <div style={{ textAlign: 'center', padding: '12px 0 24px 0' }}>
          <div
            style={{
              fontSize: '42px',
              marginBottom: '12px',
              animation: 'bounce 1s infinite alternate',
            }}
          >
            {step.icon}
          </div>
          <h3
            style={{
              margin: '0 0 8px 0',
              fontSize: '18px',
              fontWeight: 700,
              color: '#0f172a',
            }}
          >
            {step.title}
          </h3>
          <p
            style={{
              margin: 0,
              fontSize: '13px',
              color: '#475569',
              lineHeight: 1.5,
            }}
          >
            {step.description}
          </p>
        </div>

        {/* Action Buttons */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: '1px solid #e2e8f0',
            paddingTop: '16px',
          }}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            style={{ color: '#64748b' }}
          >
            Skip Tour
          </Button>

          <div style={{ display: 'flex', gap: '8px' }}>
            {currentStep > 0 && (
              <Button variant="outline" size="sm" onClick={handlePrev}>
                Previous
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={handleNext}>
              {isLast ? "Get Started 🚀" : "Next →"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};
