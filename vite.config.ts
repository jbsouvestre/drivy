import { readFileSync } from 'node:fs';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/**
 * Source maps go to Sentry only from CI release builds (which have an auth token);
 * they're deleted from dist afterwards, so they're never deployed or zipped.
 */
const uploadSourceMaps = !!process.env.SENTRY_AUTH_TOKEN;

export default defineConfig(({ command }) => ({
  // Relative asset paths, so the build works from any sub-path
  // (GitHub Pages serves project sites at /<repo>/) and from an unzipped release.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // Set in the release workflow only: dev servers and local builds never report errors.
    __SENTRY_DSN__: JSON.stringify(command === 'build' ? (process.env.SENTRY_DSN?.trim() ?? '') : ''),
  },
  build: {
    // 'hidden': maps are generated for upload, but the bundles don't point at them.
    sourcemap: uploadSourceMaps ? 'hidden' : false,
  },
  plugins: uploadSourceMaps
    ? [
        sentryVitePlugin({
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          authToken: process.env.SENTRY_AUTH_TOKEN,
          release: { name: `drivy@${pkg.version}` }, // must match the release in src/sentry.ts
          sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
          telemetry: false,
        }),
      ]
    : [],
}));
