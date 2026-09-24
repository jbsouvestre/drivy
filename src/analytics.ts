/**
 * Tiny analytics facade over PostHog. Game code calls `track(event, props)`
 * without knowing about the SDK: events sent before PostHog has (lazily)
 * loaded are queued, and everything is a no-op off the live site.
 */

/** Only the live site reports (never localhost or a local copy of the release zip). */
const LIVE_HOST = 'jbsouvestre.com';
/** Keep at most this many events while waiting for the SDK to load. */
const MAX_QUEUE = 200;

export type Properties = Record<string, string | number | boolean | null>;

/** The subset of the PostHog client we use. */
export interface AnalyticsSink {
  capture(event: string, properties?: Properties): unknown;
}

/** True when this build and page should send analytics (a PostHog key was built in, on the live site). */
export const analyticsEnabled = __POSTHOG_KEY__ !== '' && window.location.hostname === LIVE_HOST;
/** True when this build and page should report errors to Sentry. */
export const errorReportingEnabled = __SENTRY_DSN__ !== '' && window.location.hostname === LIVE_HOST;

let sink: AnalyticsSink | null = null;
let queue: [string, Properties | undefined][] | null = analyticsEnabled ? [] : null;

/** Called once PostHog is ready: sends anything recorded while it loaded. */
export function connectAnalytics(s: AnalyticsSink): void {
  sink = s;
  for (const [event, properties] of queue ?? []) s.capture(event, properties);
  queue = null;
}

/** Something happened. Event names are snake_case, past tense (e.g. `photo_taken`). */
export function track(event: string, properties?: Properties): void {
  if (sink) sink.capture(event, properties);
  else if (queue && queue.length < MAX_QUEUE) queue.push([event, properties]);
}
