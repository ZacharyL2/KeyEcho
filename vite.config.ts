import path from 'node:path';

import UnoCSS from 'unocss/vite';
import { defineConfig } from 'vite';
import Solid from 'vite-plugin-solid';

export default defineConfig(() => ({
  plugins: [Solid(), UnoCSS()],

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
