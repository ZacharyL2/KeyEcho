import path from 'node:path';

import Vue from '@vitejs/plugin-vue';
import AutoPrefixer from 'autoprefixer';
import Tailwind from 'tailwindcss';
import AutoImport from 'unplugin-auto-import/vite';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  plugins: [
    Vue(),

    AutoImport({
      dts: 'src/types/auto-imports.d.ts',
      imports: [
        'vue',
        '@vueuse/core',
        {
          'vue-request': ['useRequest'],
        },
      ],
      vueTemplate: true,
    }),
  ],

  css: {
    postcss: {
      plugins: [Tailwind(), AutoPrefixer()],
    },
  },

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
