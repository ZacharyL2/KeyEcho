import Vue from '@vitejs/plugin-vue';
import UnoCSS from 'unocss/vite';
import AutoImport from 'unplugin-auto-import/vite';
import { PrimeVueResolver } from 'unplugin-vue-components/resolvers';
import Components from 'unplugin-vue-components/vite';
import VueMacros from 'unplugin-vue-macros/vite';
import { defineConfig } from 'vite';
import TsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig(() => ({
  plugins: [
    TsConfigPaths(),

    VueMacros({
      plugins: {
        vue: Vue({
          include: [/\.vue$/],
        }),
      },
    }),

    // https://github.com/antfu/unplugin-auto-import
    AutoImport({
      vueTemplate: true,
      dts: 'src/types/auto-imports.d.ts',
      imports: [
        'vue',
        '@vueuse/core',
        {
          'vue-request': ['useRequest'],
        },
        {
          'primevue/usetoast': ['useToast'],
          'primevue/useconfirm': ['useConfirm'],
        },
      ],
      resolvers: [PrimeVueResolver()],
    }),

    // https://github.com/antfu/unplugin-vue-components
    Components({
      dts: 'src/types/components.d.ts',
      resolvers: [PrimeVueResolver()],
    }),

    UnoCSS(),
  ],

  clearScreen: false,

  server: {
    port: 1426,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
}));
