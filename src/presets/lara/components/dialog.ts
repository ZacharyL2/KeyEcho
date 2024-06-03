import type { DialogPassThroughOptions } from 'primevue/dialog';

export default {
  closeButton: {
    class: [
      'relative',

      // Flexbox and Alignment
      'flex items-center justify-center',

      // Size and Spacing
      'mr-2',
      'last:mr-0',
      'w-8 h-8',

      // Shape
      'border-0',
      'rounded-full',

      // Colors
      'text-surface-500',
      'bg-transparent',

      // Transitions
      'transition duration-200 ease-in-out',

      // States
      'hover:text-surface-700 dark:hover:text-white/80',
      'hover:bg-surface-100 dark:hover:bg-surface-800/80',
      'focus:outline-offset-0 focus:outline-0 focus:ring-inset',
      'focus:ring-primary-400/50 dark:focus:ring-primary-300/50',

      // Misc
      'overflow-hidden',
    ],
  },
  closeButtonIcon: {
    class: [
      // Display
      'inline-block',

      // Size
      'w-4',
      'h-4',
    ],
  },
  content: ({ instance, state }) => ({
    class: [
      // Spacing
      'px-6',
      'pb-6',
      'pt-0',

      // Shape
      {
        grow: state.maximized,
        'rounded-bl-lg': !instance.$slots.footer,
        'rounded-br-lg': !instance.$slots.footer,
      },

      // Colors
      'bg-surface-0 dark:bg-surface-800',
      'text-surface-700 dark:text-surface-0/80',

      // Misc
      'overflow-y-auto',
    ],
  }),
  footer: {
    class: [
      // Flexbox and Alignment
      'flex items-center justify-end',
      'shrink-0',
      'text-right',
      'gap-2',

      // Spacing
      'px-6',
      'pb-6',

      // Shape
      'border-t-0',
      'rounded-b-lg',

      // Colors
      'bg-surface-0 dark:bg-surface-800',
      'text-surface-700 dark:text-surface-0/80',
    ],
  },
  header: {
    class: [
      // Flexbox and Alignment
      'flex items-center justify-between',
      'shrink-0',

      // Spacing
      'p-6',

      // Shape
      'border-t-0',
      'rounded-tl-lg',
      'rounded-tr-lg',

      // Colors
      'bg-surface-0 dark:bg-surface-800',
      'text-surface-700 dark:text-surface-0/80',
    ],
  },
  icons: {
    class: ['flex items-center'],
  },
  mask: ({ props, state }) => ({
    class: [
      // Transitions
      'transition',
      'duration-200',
      { 'p-5': !state.maximized },

      // Background and Effects
      { 'backdrop-blur-sm': props.modal, 'bg-black/40': props.modal },
    ],
  }),
  maximizablebutton: {
    class: [
      'relative',

      // Flexbox and Alignment
      'flex items-center justify-center',

      // Size and Spacing
      'mr-2',
      'last:mr-0',
      'w-8 h-8',

      // Shape
      'border-0',
      'rounded-full',

      // Colors
      'text-surface-500',
      'bg-transparent',

      // Transitions
      'transition duration-200 ease-in-out',

      // States
      'hover:text-surface-700 dark:hover:text-white/80',
      'hover:bg-surface-100 dark:hover:bg-surface-800/80',
      'focus:outline-offset-0 focus:ring focus:ring-inset',
      'focus:ring-primary-400/50 dark:focus:ring-primary-300/50',

      // Misc
      'overflow-hidden',
    ],
  },
  maximizableicon: {
    class: [
      // Display
      'inline-block',

      // Size
      'w-4',
      'h-4',
    ],
  },
  root: ({ state }) => ({
    class: [
      // Shape
      'rounded-lg',
      'shadow-lg',
      'border-0',

      // Size
      'max-h-[90vh]',
      'w-[50vw]',
      'm-0',

      // Color
      'dark:border',
      'dark:border-surface-700',

      // Transitions
      'transform',
      'scale-100',

      // Maximized State
      {
        '!h-screen': state.maximized,
        '!left-0': state.maximized,
        '!max-h-full': state.maximized,
        '!top-0': state.maximized,
        '!w-screen': state.maximized,
        'transform-none': state.maximized,
        'transition-none': state.maximized,
      },
    ],
  }),
  title: {
    class: ['font-bold text-lg'],
  },
  transition: ({ props }) => {
    return props.position === 'top'
      ? {
          enterActiveClass: 'transition-all duration-200 ease-out',
          enterFromClass:
            'opacity-0 scale-75 translate-x-0 -translate-y-full translate-z-0',
          leaveActiveClass: 'transition-all duration-200 ease-out',
          leaveToClass:
            'opacity-0 scale-75 translate-x-0 -translate-y-full translate-z-0',
        }
      : props.position === 'bottom'
        ? {
            enterActiveClass: 'transition-all duration-200 ease-out',
            enterFromClass: 'opacity-0 scale-75 translate-y-full',
            leaveActiveClass: 'transition-all duration-200 ease-out',
            leaveToClass:
              'opacity-0 scale-75 translate-x-0 translate-y-full translate-z-0',
          }
        : props.position === 'left' ||
            props.position === 'topleft' ||
            props.position === 'bottomleft'
          ? {
              enterActiveClass: 'transition-all duration-200 ease-out',
              enterFromClass:
                'opacity-0 scale-75 -translate-x-full translate-y-0 translate-z-0',
              leaveActiveClass: 'transition-all duration-200 ease-out',
              leaveToClass:
                'opacity-0 scale-75  -translate-x-full translate-y-0 translate-z-0',
            }
          : props.position === 'right' ||
              props.position === 'topright' ||
              props.position === 'bottomright'
            ? {
                enterActiveClass: 'transition-all duration-200 ease-out',
                enterFromClass:
                  'opacity-0 scale-75 translate-x-full translate-y-0 translate-z-0',
                leaveActiveClass: 'transition-all duration-200 ease-out',
                leaveToClass:
                  'opacity-0 scale-75 opacity-0 scale-75 translate-x-full translate-y-0 translate-z-0',
              }
            : {
                enterActiveClass: 'transition-all duration-200 ease-out',
                enterFromClass: 'opacity-0 scale-75',
                leaveActiveClass: 'transition-all duration-200 ease-out',
                leaveToClass: 'opacity-0 scale-75',
              };
  },
} as DialogPassThroughOptions;
