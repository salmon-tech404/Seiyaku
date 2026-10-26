import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/**/*.{test,spec}.{ts,tsx,js,jsx}',
      'apps/**/*.{test,spec}.{ts,tsx,js,jsx}',
      'scripts/**/*.{test,spec}.{ts,tsx,js,jsx}',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', 'contracts/**'],
  },
});
