import type { SagaExecutionState, SagaStepDefinition } from './transactions-types.js';

export function createDefaultSagaState(sagaId = 'saga-checkout-99'): SagaExecutionState {
  const steps: SagaStepDefinition[] = [
    {
      stepId: 'step-1-order',
      name: 'Create Pending Order',
      forwardAction: 'INSERT orders (status=PENDING)',
      compensatingAction: 'UPDATE orders SET status=CANCELLED',
      state: 'PENDING',
    },
    {
      stepId: 'step-2-inventory',
      name: 'Reserve Inventory',
      forwardAction: 'DECREMENT stock WHERE item_id=42',
      compensatingAction: 'INCREMENT stock WHERE item_id=42',
      state: 'PENDING',
    },
    {
      stepId: 'step-3-payment',
      name: 'Charge Customer Card',
      forwardAction: 'POST /v1/charges ($49.99)',
      compensatingAction: 'POST /v1/refunds ($49.99)',
      state: 'PENDING',
    },
    {
      stepId: 'step-4-shipping',
      name: 'Schedule Carrier Dispatch',
      forwardAction: 'POST /v1/shipments/book',
      compensatingAction: 'DELETE /v1/shipments/book',
      state: 'PENDING',
    },
  ];

  return {
    sagaId,
    steps,
    currentStepIndex: 0,
    status: 'NOT_STARTED',
    forwardCompletedOrder: [],
    compensationExecutedOrder: [],
  };
}

/**
 * Steps the Saga execution forward or backward.
 */
export function stepSagaExecution(
  state: SagaExecutionState,
  stepIndex: number,
  success: boolean,
): SagaExecutionState {
  const next: SagaExecutionState = JSON.parse(JSON.stringify(state)) as SagaExecutionState;
  next.status = 'RUNNING';

  const step = next.steps[stepIndex];
  if (!step) return next;

  if (success) {
    step.state = 'SUCCEEDED';
    next.forwardCompletedOrder.push(step.stepId);

    if (stepIndex === next.steps.length - 1) {
      // All steps succeeded
      next.status = 'COMPLETED';
    } else {
      next.currentStepIndex = stepIndex + 1;
      next.steps[stepIndex + 1]!.state = 'EXECUTING';
    }
  } else {
    // Step failed -> Trigger compensation unwinding in strict reverse order!
    step.state = 'FAILED';
    next.status = 'COMPENSATING';

    // Unwind all previously succeeded steps in reverse order
    const toCompensate = [...next.forwardCompletedOrder].reverse();
    for (const stepId of toCompensate) {
      const s = next.steps.find((item) => item.stepId === stepId);
      if (s) {
        s.state = 'COMPENSATED';
        next.compensationExecutedOrder.push(stepId);
      }
    }

    next.status = 'COMPENSATED';
  }

  return next;
}
