import {
  presetAttributify,
  presetIcons,
  presetTypography,
  presetUno,
  presetWind,
  type UserConfig,
} from 'unocss';
import type { Theme } from 'unocss/preset-uno';

const theme: Theme = {
  animation: {},
  colors: {
    'primary-50': 'rgb(239, 246, 255)',
    'primary-100': 'rgb(219, 234, 254)',
    'primary-200': 'rgb(191, 219, 254)',
    'primary-300': 'rgb(147, 197, 253)',
    'primary-400': 'rgb(96, 165, 250)',
    'primary-500': 'rgb(59, 130, 246)',
    'primary-600': 'rgb(37, 99, 235)',
    'primary-700': 'rgb(29, 78, 216)',
    'primary-800': 'rgb(30, 64, 175)',
    'primary-900': 'rgb(30, 58, 138)',
    'primary-950': 'rgb(23, 37, 84)',
    'surface-0': 'rgb(255, 255, 255)',
    'surface-50': 'rgb(249, 250, 251)',
    'surface-100': 'rgb(243, 244, 246)',
    'surface-200': 'rgb(229, 231, 235)',
    'surface-300': 'rgb(209, 213, 219)',
    'surface-400': 'rgb(156, 163, 175)',
    'surface-500': 'rgb(107, 114, 128)',
    'surface-600': 'rgb(75, 85, 99)',
    'surface-700': 'rgb(55, 65, 81)',
    'surface-800': 'rgb(31, 41, 55)',
    'surface-900': 'rgb(17, 24, 39)',
    'surface-950': 'rgb(8, 8, 8)',
  },
};

const config: UserConfig<Theme> = {
  theme,

  shortcuts: [
    {
      'full-center': 'grid size-full place-items-center',
      'clickable-text':
        'color-surface-500 cursor-pointer transition-400 hover:color-primary-500',
      'spinner-loading':
        'i-ri-loader-4-line animate-spin cursor-progress color-primary-400',
    },
  ],

  presets: [
    presetUno(),
    presetWind(),
    presetAttributify({
      prefix: 'un-',
      prefixedOnly: true,
    }),
    presetTypography(),
    presetIcons({
      scale: 1.4,
      warn: true,
    }),
  ],

  warn: true,

  content: {
    pipeline: {
      include: [
        /\.(vue|svelte|[jt]sx|mdx?|astro|elm|php|phtml|html)($|\?)/,
        'src/presets/**/*.{js,ts}',
      ],
    },
  },
};

export default config;
