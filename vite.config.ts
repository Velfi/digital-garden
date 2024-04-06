import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { imagetools } from 'vite-imagetools';

export default defineConfig({
  plugins: [imagetools(), sveltekit()],
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
