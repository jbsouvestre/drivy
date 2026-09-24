/**
 * Tiny metrics facade over Sentry metrics. Game code calls `count` / `gauge` /
 * `distribution` without knowing about the SDK: calls made before Sentry has
 * (lazily) loaded are queued, and everything is a no-op off the live site.
 */

/** Only the live site reports (never localhost or a local copy of the release zip). */
const LIVE_HOST = 'jbsouvestre.com';
/** Keep at most this many calls while waiting for the SDK to load. */
const MAX_QUEUE = 200;

export type Attributes = Record<string, string | number | boolean>;
export type Unit = 'none' | 'second' | 'millisecond' | 'percent';

/** The subset of `Sentry.metrics` we use. */
export interface MetricsSink {
  count(name: string, value?: number, options?: { attributes?: Attributes }): void;
  gauge(name: string, value: number, options?: { unit?: Unit; attributes?: Attributes }): void;
  distribution(name: string, value: number, options?: { unit?: Unit; attributes?: Attributes }): void;
}

/** True when this build and page should report errors and metrics. */
export const reporting = __SENTRY_DSN__ !== '' && window.location.hostname === LIVE_HOST;

let sink: MetricsSink | null = null;
let queue: ((s: MetricsSink) => void)[] | null = reporting ? [] : null;

function emit(call: (s: MetricsSink) => void): void {
  if (sink) call(sink);
  else if (queue && queue.length < MAX_QUEUE) queue.push(call);
}

/** Called once Sentry is ready: replays anything recorded while it loaded. */
export function connectMetrics(s: MetricsSink): void {
  sink = s;
  for (const call of queue ?? []) call(s);
  queue = null;
}

/** Something happened (`value` times). */
export function count(name: string, value = 1, attributes?: Attributes): void {
  emit((s) => s.count(name, value, { attributes }));
}

/** The current value of something (e.g. species found so far). */
export function gauge(name: string, value: number, unit: Unit = 'none', attributes?: Attributes): void {
  emit((s) => s.gauge(name, value, { unit, attributes }));
}

/** One sample of a spread of values (e.g. session length, frame rate). */
export function distribution(name: string, value: number, unit: Unit = 'none', attributes?: Attributes): void {
  emit((s) => s.distribution(name, value, { unit, attributes }));
}
