import { pack } from 'msgpackr';

import { validateGatewayMessage } from '@the-visualizer/contracts';
import { logger } from '@the-visualizer/logging';

/**
 * Gateway egress choke point.
 *
 * Every server → client frame is packed through here. In non-production we
 * validate the frame against `GatewayServerMessageSchema` and log (loudly) on
 * drift; in production we send regardless so a schema/telemetry problem can
 * never take down live traffic. Integration tests assert zero drift.
 */
export function packEgress(message: { type: string; payload: unknown }): Buffer {
  if (process.env.NODE_ENV !== 'production') {
    const result = validateGatewayMessage(message);
    if (!result.ok) {
      logger.error(
        { type: message.type, error: result.error },
        'Gateway egress violated the server message contract',
      );
    }
  }
  return pack(message);
}
