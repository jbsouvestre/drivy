import * as Sentry from '@sentry/browser';

/** Error reporting and tracing for the live site. Loaded only from CI builds with a DSN (see main.ts). */
export function initSentry(dsn: string): void {
  Sentry.init({
    dsn,
    release: `drivy@${__APP_VERSION__}`,
    environment: 'production',
    integrations: [Sentry.browserTracingIntegration()],
    // Tracing: capture every page load.
    tracesSampleRate: 1.0,
    // No backend of our own: never attach trace headers to outgoing requests (e.g. Google Fonts).
    tracePropagationTargets: [],
  });
}
