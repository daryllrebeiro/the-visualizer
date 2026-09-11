import { DiagConsoleLogger, DiagLogLevel, diag } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
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

  // OTLP trace exporter governed by the standard OTEL_EXPORTER_OTLP_ENDPOINT
  // env var (e.g. http://tempo:4318 for Grafana Tempo). When unset, the SDK
  // default applies and spans stay process-local — set the endpoint in any
  // environment where traces must leave the box.
  const otlpEndpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];

  sdk = new NodeSDK({
    serviceName,
    // Spread (not `traceExporter: undefined`) to satisfy exactOptionalPropertyTypes.
    ...(otlpEndpoint
      ? { traceExporter: new OTLPTraceExporter({ url: `${otlpEndpoint.replace(/\/+$/, '')}/v1/traces` }) }
      : {}),
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
