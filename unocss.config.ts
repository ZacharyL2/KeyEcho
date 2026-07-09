import { defineConfig, presetUno } from 'unocss';

const color = (name: string) => `hsl(var(--${name}))`;

export default defineConfig({
  content: {
    filesystem: ['index.html', 'src/**/*.{ts,tsx}'],
  },
  presets: [presetUno()],
  theme: {
    colors: {
      accent: color('accent'),
      'accent-foreground': color('accent-foreground'),
      background: color('background'),
      border: color('border'),
      card: color('card'),
      'card-foreground': color('card-foreground'),
      destructive: color('destructive'),
      'destructive-foreground': color('destructive-foreground'),
      foreground: color('foreground'),
      input: color('input'),
      muted: color('muted'),
      'muted-foreground': color('muted-foreground'),
      popover: color('popover'),
      'popover-foreground': color('popover-foreground'),
      primary: color('primary'),
      'primary-foreground': color('primary-foreground'),
      ring: color('ring'),
      secondary: color('secondary'),
      'secondary-foreground': color('secondary-foreground'),
    },
    borderRadius: {
      lg: 'var(--radius)',
      md: 'calc(var(--radius) - 2px)',
      sm: 'calc(var(--radius) - 4px)',
      xl: 'calc(var(--radius) + 4px)',
    },
  },
});
