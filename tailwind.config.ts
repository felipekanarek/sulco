import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"EB Garamond"', 'Times New Roman', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        ink: { DEFAULT: '#1a1a1a', soft: '#3d3d3d', mute: '#8a8a8a' },
        paper: { DEFAULT: '#f7f4ed', raised: '#fbf9f3' },
        line: { DEFAULT: '#d9d4c7', soft: '#e8e4d8' },
        accent: { DEFAULT: '#a4332a', soft: '#c77a74' },
        ok: '#3d5c3a',
        warn: '#8a6d2e',
      },
    },
  },
  plugins: [],
} satisfies Config;
