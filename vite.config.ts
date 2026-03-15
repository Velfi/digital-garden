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
    include: ['src/**/*.{test,spec}.{js,ts}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,js,svelte}'],
      exclude: [
        'node_modules/',
        '.svelte-kit/',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/*.d.ts',
        '**/vite.config*',
        '**/svelte.config*'
      ]
    }
  }
});
