import { DiagConsoleLogger, DiagLogLevel, diag } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { NodeSDK } from '@opentelemetry/sdk-node';

let sdk: NodeSDK | null = null;

/**
 * Initializes OpenTelemetry Node SDK with auto-instrumentation.
 * MUST be invoked at the very first line of the application.
 */
export function initTelemetry(serviceName: string): void {
  if (process.env.NODE_ENV === 'test') return;
  if (sdk) return;

  // Set internal OTel logger to warn/error to avoid spamming console
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);

  sdk = new NodeSDK({
    serviceName,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable filesystem tracing to avoid extremely verbose logs
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();

  process.on('SIGTERM', () => {
    if (sdk) {
      sdk.shutdown().catch(() => {
        // Silent shutdown error
      });
    }
  });
}
