import type { DropdownPassThroughOptions } from 'primevue/dropdown';

export default {
  root: ({ props }) => ({
    class: [
      // Display and Position
      'inline-flex',
      'relative',

      // Shape
      'w-52 min-w-52',
      'rounded-md',

      // Color and Background
      'bg-surface-0 dark:bg-surface-900',
      'border border-surface-300 dark:border-surface-700',

      // Transitions
      'transition-all',
      'duration-200',

      // TODO: Focus needs context/props. normally gets p-focus
      // States
      'hover:border-primary-500 dark:hover:border-primary-300',
      'focus:outline-offset-0 focus:ring focus:ring-primary-400/50 dark:focus:ring-primary-300/50',

      // Misc
      'cursor-pointer',
      'select-none',
      {
        'opacity-60': props.disabled,
        'pointer-events-none': props.disabled,
        'cursor-default': props.disabled,
      },
    ],
  }),
  input: ({ props }) => ({
    class: [
      // Font
      'font-sans',
      'leading-none',

      // Display
      'block',
      'flex-auto',

      // Color and Background
      'bg-transparent',
      'border-0',
      'text-surface-800 dark:text-white/80',

      // Sizing and Spacing
      'w-[1%]',
      'p-3',
      { 'pr-7': props.showClear },

      // Shape
      'rounded-none',

      // Transitions
      'transition',
      'duration-200',

      // States
      'focus:outline-offset-0 focus:shadow-none',

      // Misc
      'relative',
      'cursor-pointer',
      'overflow-hidden overflow-ellipsis',
      'whitespace-nowrap',
      'appearance-none',
    ],
  }),
  trigger: {
    class: [
      // Flexbox
      'flex items-center justify-center',
      'shrink-0',

      // Color and Background
      'bg-transparent',
      'text-surface-500',

      // Size
      'w-12',

      // Shape
      'rounded-tr-md',
      'rounded-br-md',
    ],
  },
  panel: {
    class: [
      // Web component spec
      '!block !z-top',

      // Position
      'absolute top-0 left-0',

      // Shape
      'border-0 dark:border',
      'rounded-md',
      'shadow-md',

      // Color
      'bg-surface-0 dark:bg-surface-800',
      'text-surface-800 dark:text-white/80',
      'dark:border-surface-700',
    ],
  },
  wrapper: {
    class: [
      // Sizing
      'max-h-[200px]',

      // Misc
      'overflow-auto',
    ],
  },
  list: {
    class: 'py-3 list-none m-0',
  },
  item: ({ context }) => ({
    class: [
      // Font
      'font-normal',
      'leading-none',

      // Position
      'relative',

      // Shape
      'border-0',
      'rounded-none',

      // Spacing
      'm-0',
      'py-3 px-5',

      // Color
      {
        'text-surface-700 dark:text-white/80':
          !context.focused && !context.selected,
      },
      {
        'bg-surface-50 dark:bg-surface-600/60 text-surface-700 dark:text-white/80':
          context.focused && !context.selected,
      },
      {
        'bg-primary-100 dark:bg-primary-400/40 text-primary-700 dark:text-white/80':
          context.focused && context.selected,
      },
      {
        'bg-primary-50 dark:bg-primary-400/40 text-primary-700 dark:text-white/80':
          !context.focused && context.selected,
      },

      // States
      {
        'hover:bg-surface-100 dark:hover:bg-surface-600/80':
          !context.focused && !context.selected,
      },
      {
        'hover:text-surface-700 hover:bg-surface-100 dark:hover:text-white dark:hover:bg-surface-600/80':
          context.focused && !context.selected,
      },

      // Transitions
      'transition-shadow',
      'duration-200',

      // Misc
      'cursor-pointer',
      'overflow-hidden',
      'whitespace-nowrap',
    ],
  }),
  itemgroup: {
    class: [
      // Font
      'font-bold',

      // Spacing
      'm-0',
      'p-3',

      // Color
      'text-surface-800 dark:text-white/80',
      'bg-surface-0 dark:bg-surface-600/80',

      // Misc
      'cursor-auto',
    ],
  },
  emptymessage: {
    class: [
      // Font
      'leading-none',

      // Spacing
      'py-3 px-5',

      // Color
      'text-surface-800 dark:text-white/80',
      'bg-transparent',
    ],
  },
  header: {
    class: [
      // Spacing
      'py-3 px-5',
      'm-0',

      // Shape
      'border-b',
      'rounded-tl-md',
      'rounded-tr-md',

      // Color
      'text-surface-700 dark:text-white/80',
      'bg-surface-100 dark:bg-surface-800',
      'border-surface-300 dark:border-surface-700',
    ],
  },
  filtercontainer: {
    class: 'relative',
  },
  filterinput: {
    class: [
      // Font
      'font-sans',
      'leading-none',

      // Sizing
      'pr-7 py-3 px-3',
      '-mr-7',
      'w-full',

      // Color
      'text-surface-700 dark:text-white/80',
      'bg-surface-0 dark:bg-surface-900',
      'border-surface-200 dark:border-surface-700',

      // Shape
      'border',
      'rounded-lg',
      'appearance-none',

      // Transitions
      'transition',
      'duration-200',

      // States
      'hover:border-primary-500 dark:hover:border-primary-300',
      'focus:ring focus:outline-offset-0',
      'focus:ring-primary-400/50 dark:focus:ring-primary-300/50',

      // Misc
      'appearance-none',
    ],
  },
  filtericon: {
    class: ['absolute', 'top-1/2', '-mt-2'],
  },
  clearicon: {
    class: [
      // Color
      'text-surface-500',

      // Position
      'absolute',
      'top-1/2',
      'right-12',

      // Spacing
      '-mt-2',
    ],
  },
  transition: {
    enterFromClass: 'opacity-0 scale-y-[0.8]',
    enterActiveClass:
      'transition-transform transition-opacity duration-[120ms] ease-[cubic-bezier(0,0,0.2,1)]',
    leaveActiveClass: 'transition-opacity duration-100 ease-linear',
    leaveToClass: 'opacity-0',
  },
} as DropdownPassThroughOptions;
