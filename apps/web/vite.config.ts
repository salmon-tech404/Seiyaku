import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/viem')) {
            return 'vendor-viem';
          }
        },
        hashCharacters: 'hex',
        entryFileNames: (chunkInfo) => `assets/${chunkInfo.name.toLowerCase()}-[hash].js`,
        chunkFileNames: (chunkInfo) => `assets/${chunkInfo.name.toLowerCase()}-[hash].js`,
        assetFileNames: (assetInfo) => {
          const rawName = (assetInfo.name || 'asset').toLowerCase();
          const extIndex = rawName.lastIndexOf('.');
          const ext = extIndex !== -1 ? rawName.slice(extIndex + 1) : '';
          const base = extIndex !== -1 ? rawName.slice(0, extIndex) : rawName;
          return `assets/${base}-[hash].${ext}`;
        },
      },
    },
  },
  esbuild: {
    legalComments: 'none',
    drop: ['console', 'debugger'],
  },
});
