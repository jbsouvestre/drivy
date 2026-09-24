import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig(({ command }) => ({
  // Relative asset paths, so the build works from any sub-path
  // (GitHub Pages serves project sites at /<repo>/) and from an unzipped release.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // Set in the release workflow only: dev servers and local builds never report errors.
    __SENTRY_DSN__: JSON.stringify(command === 'build' ? (process.env.SENTRY_DSN?.trim() ?? '') : ''),
  },
}));
