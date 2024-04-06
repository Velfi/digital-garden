import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { imagetools } from 'vite-imagetools';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [nodePolyfills(), imagetools(), sveltekit()],
  server: {
    fs: {
      allow: ['static'],
      strict: true
    }
  },
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}']
  }
});
