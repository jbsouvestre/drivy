import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  // Relative asset paths, so the build works from any sub-path
  // (GitHub Pages serves project sites at /<repo>/) and from an unzipped release.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
