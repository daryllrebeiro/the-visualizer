import { registerSystem } from './registry.js';
import { MVP_CACHE_SYSTEM } from './mvp-cache.js';
import { ECOMMERCE_SYSTEM, TICKET_BOOKING_SYSTEM, COLLAB_DOCS_SYSTEM } from './flagships.js';

let bootstrapped = false;

/** Idempotent registration of built-in composite systems. */
export function bootstrapSystems(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  registerSystem(MVP_CACHE_SYSTEM);
  registerSystem(ECOMMERCE_SYSTEM);
  registerSystem(TICKET_BOOKING_SYSTEM);
  registerSystem(COLLAB_DOCS_SYSTEM);
}
