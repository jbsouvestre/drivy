import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/** Only errors from the live site are reported (not a local copy of the release zip). */
const SENTRY_HOST = 'jbsouvestre.com';

/**
 * Adds the Sentry loader to production builds when SENTRY_LOADER_KEY is set
 * (it is in the release workflow). Dev servers and local builds never load it.
 */
function sentry(): Plugin {
  const key = process.env.SENTRY_LOADER_KEY?.trim();
  return {
    name: 'drivy-sentry',
    apply: 'build',
    transformIndexHtml() {
      if (!key) return;
      if (!/^[0-9a-f]{32}$/.test(key)) throw new Error('SENTRY_LOADER_KEY should be 32 hex characters');
      const config = `
      window.sentryOnLoad = function () {
        Sentry.init({
          release: ${JSON.stringify(`drivy@${pkg.version}`)},
          environment: 'production',
          beforeSend: function (event) {
            return location.hostname === ${JSON.stringify(SENTRY_HOST)} ? event : null;
          },
        });
      };`;
      return [
        // sentryOnLoad must be defined before the loader runs.
        { tag: 'script', children: config, injectTo: 'head-prepend' },
        {
          tag: 'script',
          attrs: { src: `https://js.sentry-cdn.com/${key}.min.js`, crossorigin: 'anonymous' },
          injectTo: 'head',
        },
      ];
    },
  };
}

export default defineConfig({
  // Relative asset paths, so the build works from any sub-path
  // (GitHub Pages serves project sites at /<repo>/) and from an unzipped release.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [sentry()],
});
