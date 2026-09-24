import posthog from 'posthog-js';
import { connectAnalytics } from './analytics';

/** Product analytics for the live site. Loaded only from CI builds with a key (see main.ts). */
export function initPostHog(key: string, host: string): void {
  posthog.init(key, {
    api_host: host,
    defaults: '2026-05-30',
    // Anonymous players only: no person profiles until someone is identified (there are no accounts).
    person_profiles: 'identified_only',
    // A canvas game makes heavy, unhelpful recordings; errors go to Sentry.
    disable_session_recording: true,
    capture_exceptions: false,
  });
  posthog.register({ app_version: __APP_VERSION__ });
  connectAnalytics(posthog);
}
