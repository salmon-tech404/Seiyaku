import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/**/*.{test,spec}.{ts,js}',
      'apps/**/*.{test,spec}.{ts,js}',
      'scripts/**/*.{test,spec}.{ts,js}',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', 'contracts/**'],
  },
});
