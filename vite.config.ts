import path from 'node:path';

import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { defineConfig } from 'vite';
import Solid from 'vite-plugin-solid';

export default defineConfig(() => ({
  plugins: [vanillaExtractPlugin(), Solid()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },

  clearScreen: false,

  server: {
    port: 3426,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
}));
